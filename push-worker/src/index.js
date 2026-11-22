// Pitkit push server (Cloudflare Worker).
// The phone uploads its upcoming reminders; a cron trigger every minute sends the ones that are due.
//
// KV layout (binding PITKIT):
//   devices           -> JSON array of device ids
//   dev:<deviceId>    -> { subscription, schedule: [{at, title, body, url, tag}], updated }
//
// Secrets/vars: VAPID_PUBLIC, VAPID_PRIVATE (secret), VAPID_SUBJECT, ALLOWED_ORIGINS (comma-separated)

import { sendPush } from './webpush.js';

const MAX_ITEMS = 800;
const MAX_TEXT = 300;
const LATE_LIMIT = 6 * 3600 * 1000; // don't send reminders that are more than 6h overdue

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function cleanSchedule(list) {
  if (!Array.isArray(list)) return [];
  const str = v => String(v ?? '').slice(0, MAX_TEXT);
  return list.slice(0, MAX_ITEMS)
    .filter(x => x && Number.isFinite(x.at))
    .map(x => ({ at: Math.round(x.at), title: str(x.title), body: str(x.body), url: str(x.url), tag: str(x.tag) }))
    .sort((a, b) => a.at - b.at);
}
function validSub(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(id);

async function getDevices(env) {
  return JSON.parse((await env.PITKIT.get('devices')) || '[]');
}
async function addDevice(env, id) {
  const list = await getDevices(env);
  if (!list.includes(id)) { list.push(id); await env.PITKIT.put('devices', JSON.stringify(list)); }
}
async function removeDevice(env, id) {
  const list = (await getDevices(env)).filter(x => x !== id);
  await env.PITKIT.put('devices', JSON.stringify(list));
  await env.PITKIT.delete('dev:' + id);
}
const pushOpts = env => ({ subject: env.VAPID_SUBJECT, vapidPublic: env.VAPID_PUBLIC, vapidPrivate: env.VAPID_PRIVATE });

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (req.method !== 'POST') return json({ ok: true, service: 'pitkit-push' }, 200, h);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    if (!validId(body.device)) return json({ error: 'bad device' }, 400, h);
    const key = 'dev:' + body.device;

    if (url.pathname === '/sync') {
      const prev = JSON.parse((await env.PITKIT.get(key)) || 'null');
      const subscription = validSub(body.subscription) ? body.subscription : prev?.subscription;
      if (!subscription) return json({ error: 'no subscription' }, 400, h);
      const schedule = cleanSchedule(body.schedule);
      await env.PITKIT.put(key, JSON.stringify({ subscription, schedule, updated: Date.now() }));
      await addDevice(env, body.device);
      return json({ ok: true, scheduled: schedule.length, next: schedule[0]?.at ?? null }, 200, h);
    }

    if (url.pathname === '/test') {
      const rec = JSON.parse((await env.PITKIT.get(key)) || 'null');
      if (!rec) return json({ error: 'not registered' }, 404, h);
      const status = await sendPush(rec.subscription, { title: '🐣 פתקית', body: 'היי 💗 ככה ייראו התזכורות שלך', url: './', tag: 'test' }, pushOpts(env));
      if (status === 404 || status === 410) await removeDevice(env, body.device);
      return json({ ok: status >= 200 && status < 300, status }, 200, h);
    }

    if (url.pathname === '/unregister') {
      await removeDevice(env, body.device);
      return json({ ok: true }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  },

  async scheduled(event, env, ctx) {
    const now = Date.now();
    for (const id of await getDevices(env)) {
      const rec = JSON.parse((await env.PITKIT.get('dev:' + id)) || 'null');
      if (!rec) continue;
      const due = rec.schedule.filter(x => x.at <= now);
      if (!due.length) continue;
      rec.schedule = rec.schedule.filter(x => x.at > now);
      let gone = false;
      for (const x of due) {
        if (now - x.at > LATE_LIMIT) continue;
        const status = await sendPush(rec.subscription, { title: x.title, body: x.body, url: x.url, tag: x.tag }, pushOpts(env));
        if (status === 404 || status === 410) { gone = true; break; }
      }
      if (gone) await removeDevice(env, id);
      else await env.PITKIT.put('dev:' + id, JSON.stringify(rec));
    }
  },
};
