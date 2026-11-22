// Round-trip test: encrypt with our Worker code, decrypt with the reference `http_ece` library.
// Also checks that the VAPID JWT verifies with the public key.
// Run: cd tools && npm i --no-save http_ece@1.2.0 && node test-webpush.mjs
import crypto from 'node:crypto';
import ece from 'http_ece';
import { encryptPayload, vapidHeader, b64uToBytes, bytesToB64u } from '../push-worker/src/webpush.js';

// A fake browser subscription
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: bytesToB64u(ua.getPublicKey()), auth: bytesToB64u(auth) } };

const msg = JSON.stringify({ title: '✂️ לבטל בזמן', body: 'היי 💗 בעוד יומיים צריך לבטל תור' });
const body = Buffer.from(await encryptPayload(sub, msg));
const out = ece.decrypt(body, { version: 'aes128gcm', privateKey: ua, authSecret: auth });
if (out.toString() !== msg) throw new Error('payload mismatch: ' + out.toString());
console.log('✓ payload decrypts:', out.toString());

// VAPID
const v = crypto.createECDH('prime256v1'); v.generateKeys();
const hdr = await vapidHeader(sub.endpoint, 'https://example.github.io/pitkit/', bytesToB64u(v.getPublicKey()), bytesToB64u(v.getPrivateKey()));
const [, jwt, k] = hdr.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, c, s] = jwt.split('.');
const pub = b64uToBytes(k);
const key = await crypto.webcrypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33)) }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
const ok = await crypto.webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64uToBytes(s), new TextEncoder().encode(h + '.' + c));
if (!ok) throw new Error('VAPID signature invalid');
console.log('✓ VAPID JWT verifies, aud =', JSON.parse(Buffer.from(b64uToBytes(c)).toString()).aud);
