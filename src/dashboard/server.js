// Owner web dashboard: read-only live stats. OFF unless DASHBOARD_PORT is set. Needs the secret token to open.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { snapshot } from '../utils/botstats.js';
import { page } from './page.js';
import { getCollector, githubStats } from '../telemetry/index.js';
import { ask as askOps } from './assistant.js';
import { MAX_BODY } from '../telemetry/payload.js';

const tokenFile = () => path.join(config.paths.data, 'dashboard-token');
export function getToken(rotate = false) {
  try { if (!rotate) { const t = fs.readFileSync(tokenFile(), 'utf8').trim(); if (t.length >= 32) return t; } } catch { /* create */ }
  const t = crypto.randomBytes(24).toString('hex');
  try { fs.mkdirSync(path.dirname(tokenFile()), { recursive: true }); fs.writeFileSync(tokenFile(), t, { mode: 0o600 }); } catch { /* best effort */ }
  return t;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const fails = new Map();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => (n ? (n / 1048576).toFixed(0) + ' MB' : '-');
const dur = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export const render = (s, nonce = '') => page(s, nonce);

let snap = null; let snapAt = 0; let inflight = null;
/** One snapshot per ~900 ms no matter how many viewers poll: keeps 1 s refresh cheap. */
async function cached(registry) {
  if (snap && Date.now() - snapAt < 900) return snap;
  inflight ||= snapshot(registry).then((v) => { snap = v; snapAt = Date.now(); return v; }).finally(() => { inflight = null; });
  return inflight;
}

export function startDashboard(registry) {
  const port = Number(process.env.DASHBOARD_PORT || 0);
  if (!port) return null;
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  const srv = http.createServer(async (req, res) => {
    try {
      const u0 = new URL(req.url, 'http://x');
      if (u0.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end('ok'); }
      if (u0.pathname === '/agent-event' && req.method === 'POST') {
        const tok = String(process.env.JARVIS_EVENT_TOKEN || '');
        if (!tok || req.headers.authorization !== 'Bearer ' + tok) { res.writeHead(401); return res.end('Unauthorized'); }
        const chunks = []; let n = 0;
        for await (const c of req) { n += c.length; if (n > 2048) { res.writeHead(413); return res.end(); } chunks.push(c); }
        let text = '';
        try { text = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).text || '').slice(0, 1000); } catch { /* invalid */ }
        if (!text) { res.writeHead(400); return res.end('{"error":"missing text"}'); }
        try {
          const { getSock } = await import('../utilities/ownersock.js');
          const s = getSock();
          const own = String(config.ownerNumber).replace(/\D/g, '') + '@s.whatsapp.net';
          if (!s) throw new Error('bot not connected');
          await s.sendMessage(own, { text: '🔔 ' + text });
          res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}');
        } catch (e) { res.writeHead(502); return res.end('{"error":"delivery failed"}'); }
      }
      if (u0.pathname === '/telemetry') {
        const col = getCollector();
        if (!col || req.method !== 'POST') { res.writeHead(col ? 405 : 404); return res.end(); }
        const chunks = []; let n = 0;
        for await (const c of req) { n += c.length; if (n > MAX_BODY) { res.writeHead(413); return res.end(); } chunks.push(c); }
        let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* rejected below */ }
        const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        const out = col.ingest(body, fwd || req.socket.remoteAddress || '?');
        res.writeHead(out ? 200 : 400, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(out || { error: 'rejected' }));
      }
      const ip = req.socket.remoteAddress || '?';
      const f = fails.get(ip) || { n: 0, t: 0 };
      if (f.n >= 8 && Date.now() - f.t < 600_000) { res.writeHead(429); return res.end('Too many attempts'); }
      const u = new URL(req.url, 'http://x');
      const given = u.searchParams.get('t') || (req.headers.cookie || '').match(/jvdash=([a-f0-9]+)/)?.[1] || '';
      if (!safeEq(given, getToken())) { fails.set(ip, { n: f.n + 1, t: Date.now() }); res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('Unauthorized'); }
      fails.delete(ip);
      const s = await cached(registry);
      const nonce = crypto.randomBytes(12).toString('base64');
      const h = { 'cache-control': 'no-store', 'set-cookie': `jvdash=${given}; HttpOnly; SameSite=Strict; Path=/`, 'x-content-type-options': 'nosniff', 'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'` };
      if (u.pathname === '/api/installs') { const col = getCollector(); res.writeHead(200, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify({ enabled: !!col, ...(col ? col.summary() : {}), directiveKey: col ? col.directivePublicKey : '', github: await githubStats() })); }
      if (u.pathname === '/api/feedback') { const col = getCollector(); res.writeHead(col ? 200 : 404, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify({ items: col ? col.feedbackList(30) : [] })); }
      if (u.pathname === '/api/install') { const col = getCollector(); const d = col && col.detail(String(u.searchParams.get('sid') || '').slice(0, 12)); res.writeHead(d ? 200 : 404, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify(d || { error: 'not found' })); }
      if (u.pathname === '/api/lookup' && req.method === 'POST') {
        const col = getCollector(); const t = Date.now(); const L = (globalThis.__jvLookups ||= []); while (L.length && t - L[0] > 60000) L.shift();
        if (!col || L.length >= 20) { res.writeHead(col ? 429 : 404, h); return res.end(); } L.push(t);
        const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 512) { res.writeHead(413, h); return res.end(); } chunks.push(c); }
        let num = ''; try { num = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).number || ''); } catch { /* invalid below */ }
        res.writeHead(200, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify(col.lookupNumber(num)));
      }
      if (u.pathname === '/api/assistant' && req.method === 'POST') {
        const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 1024) { res.writeHead(413, h); return res.end(); } chunks.push(c); }
        let q = ''; try { q = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).q || ''); } catch { /* empty -> 400 */ }
        const col = getCollector(); const out = await askOps(q, s, col ? col.summary() : null);
        res.writeHead(out.status, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify({ text: out.text }));
      }
      if (u.pathname === '/api/stats') { res.writeHead(200, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify(s)); }
      res.writeHead(200, { ...h, 'content-type': 'text/html; charset=utf-8' }); res.end(render(s, nonce));
    } catch (e) { res.writeHead(500); res.end('Error'); }
  });
  srv.on('error', (e) => logger.warn('[dashboard] ' + e.message));
  srv.listen(port, host, () => logger.info(`[dashboard] listening on ${host}:${port}`));
  srv.unref?.();
  return srv;
}
