// Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID), WebCrypto only.
// Works in Cloudflare Workers and in Node 20+.

const enc = new TextEncoder();

export function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64u(b) {
  b = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// vapidPublic: base64url of the 65-byte uncompressed P-256 point. vapidPrivate: base64url of the 32-byte scalar d.
async function vapidKey(vapidPublic, vapidPrivate) {
  const pub = b64uToBytes(vapidPublic);
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)),
    d: vapidPrivate,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function vapidHeader(endpoint, subject, vapidPublic, vapidPrivate) {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await vapidKey(vapidPublic, vapidPrivate);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + claims));
  return `vapid t=${header}.${claims}.${bytesToB64u(sig)}, k=${vapidPublic}`;
}

export async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64uToBytes(subscription.keys.p256dh);
  const authSecret = b64uToBytes(subscription.keys.auth);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const padded = concat(enc.encode(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Returns the push service's HTTP status (201 = accepted, 404/410 = subscription gone).
export async function sendPush(subscription, data, { subject, vapidPublic, vapidPrivate, ttl = 86400 }) {
  const body = await encryptPayload(subscription, JSON.stringify(data));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, subject, vapidPublic, vapidPrivate),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}
