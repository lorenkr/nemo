// Exercises the Worker's /sync, /test and cron handlers with an in-memory KV and a fake push service.
// Run: node tools/test-worker.mjs
import crypto from 'node:crypto';
import worker from '../push-worker/src/index.js';
import { bytesToB64u } from '../push-worker/src/webpush.js';

const store = new Map();
const KV = { get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v), delete: async k => void store.delete(k) };
const v = crypto.createECDH('prime256v1'); v.generateKeys();
const env = { PITKIT: KV, VAPID_PUBLIC: bytesToB64u(v.getPublicKey()), VAPID_PRIVATE: bytesToB64u(v.getPrivateKey()), VAPID_SUBJECT: 'https://x.github.io/pitkit/', ALLOWED_ORIGINS: 'https://x.github.io' };

const sent = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => { sent.push({ url, headers: init.headers, bytes: init.body.length }); return new Response(null, { status: pushStatus }); };

const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const subscription = { endpoint: 'https://web.push.apple.com/QWERTY', keys: { p256dh: bytesToB64u(ua.getPublicKey()), auth: bytesToB64u(crypto.randomBytes(16)) } };
const device = 'abcdefghijklmnopqrstuvwxyz012345';
const post = (path, body) => worker.fetch(new Request('https://w.dev' + path, { method: 'POST', headers: { Origin: 'https://x.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('✓', m); };

const now = Date.now();
let r = await post('/sync', { device, subscription, schedule: [
  { at: now - 60_000, title: 'due', body: 'b1', url: './?item=1', tag: 'r1' },
  { at: now - 7 * 3600_000, title: 'too old', body: 'b2', url: '', tag: 'x' },
  { at: now + 3600_000, title: 'later', body: 'b3', url: '', tag: 'y' },
] });
assert(r.status === 200, 'sync accepted');
assert(r.headers.get('Access-Control-Allow-Origin') === 'https://x.github.io', 'CORS allows the site');
assert(JSON.parse(store.get('devices')).includes(device), 'device registered');

await worker.scheduled({}, env, {});
assert(sent.length === 1, 'cron sent only the due reminder (skipped the >6h-old one)');
assert(sent[0].headers['Content-Encoding'] === 'aes128gcm' && sent[0].headers.Authorization.startsWith('vapid t='), 'push request is encrypted and VAPID-signed');
const rec = JSON.parse(store.get('dev:' + device));
assert(rec.schedule.length === 1 && rec.schedule[0].title === 'later', 'sent reminders removed, future ones kept');

await worker.scheduled({}, env, {});
assert(sent.length === 1, 'nothing re-sent on next minute');

r = await post('/test', { device });
assert((await r.json()).ok && sent.length === 2, 'test notification sent');

pushStatus = 410;
r = await post('/test', { device });
assert(!store.has('dev:' + device), 'expired subscription (410) cleans up the device');

r = await post('/sync', { device: 'short', schedule: [] });
assert(r.status === 400, 'rejects bad device id');
console.log('all worker tests passed');
