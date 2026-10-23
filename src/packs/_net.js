// Provider chain for web-backed commands: primary -> one automatic retry -> fallback providers -> clear failure message.
// Free, no-key sources only. In-memory health stats (providerStatus) and a small response cache.
import { fetchPublic } from '../utilities/validation.js';

export const health = new Map();
const cache = new Map();
const CACHE_MS = 120_000;
let fetchImpl = null; // null = guarded default (fetchPublic); setFetch injects a test double
export const setFetch = (f) => { fetchImpl = f || null; cache.clear(); health.clear(); };
const rec = (id) => { if (!health.has(id)) health.set(id, { ok: 0, fail: 0, lastOk: null, lastFail: null, lastError: null, consecutiveFail: 0 }); return health.get(id); };
const note = (id, err) => { const h = rec(id); if (err) { h.fail++; h.consecutiveFail++; h.lastFail = Date.now(); h.lastError = String(err.message || err).slice(0, 120); } else { h.ok++; h.consecutiveFail = 0; h.lastOk = Date.now(); } };
export const providerStatus = () => [...health.entries()].map(([id, h]) => ({ id, ...h, state: h.consecutiveFail >= 3 ? 'FAILED' : h.ok || !h.fail ? 'WORKING' : 'DEGRADED' }));
async function get(url, { timeoutMs = 8000, headers = {}, text = false } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 8000);
  try {
    let status, body;
    if (fetchImpl) {
      const r = await fetchImpl(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (JarvisBot)', accept: 'application/json,text/plain,*/*', ...headers } });
      status = r.status; body = await r.text();
    } else {
      const r = await fetchPublic(url, { maxBytes: 2_100_000, timeoutMs: timeoutMs || 8000, headers: { 'user-agent': 'Mozilla/5.0 (JarvisBot)', accept: 'application/json,text/plain,*/*', ...headers } });
      status = r.status; body = r.body.toString('utf8');
    }
    if (status === 429) throw Object.assign(new Error('rate limited'), { rate: true });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    if (!body.trim()) throw Object.assign(new Error('no data'), { final: true });
    if (body.length > 2_000_000) throw new Error('response too large');
    return text ? body : JSON.parse(body);
  } catch (e) { if (e.name === 'AbortError') throw new Error('timeout'); throw e; } finally { clearTimeout(t); }
}
/** providers: [{ id, url | run(get), parse(data) -> string }] tried in order; each gets one retry (except on rate limit / 404 / timeout). */
export async function chain(providers, { key, text = false } = {}) {
  const ck = key && `${key}`; const hit = ck && cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  const errors = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = p.run ? await p.run((u, o) => get(u, { text: false, timeoutMs: p.timeoutMs, ...o })) : await get(p.url, { text: p.text ?? text, headers: p.headers, timeoutMs: p.timeoutMs });
        const out = p.parse ? p.parse(data) : data;
        if (out == null || out === '') throw Object.assign(new Error('no data'), { final: true });
        note(p.id); if (ck) { cache.set(ck, { at: Date.now(), v: out }); if (cache.size > 300) cache.clear(); } return out;
      } catch (e) {
        note(p.id, e); errors.push(`${p.id}: ${e.message}`);
        if (e.rate || e.final || e.message === 'timeout' || /HTTP 4(04|0[013])/.test(e.message)) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
  const allRate = errors.length && errors.every((m) => /rate limited/.test(m));
  const none = errors.length && errors.every((m) => /no data|HTTP 40[04]/.test(m));
  throw new Error(none ? 'nothing found for that query' : allRate ? 'the data sources are rate limiting right now, try again in a minute' : 'the data sources are not responding right now, try again in a minute');
}
