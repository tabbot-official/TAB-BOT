import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';

/**
 * Temp mail with a provider chain. Each provider: {name, create(fetch), inbox(session,fetch), read(session,id,fetch)}.
 * create() walks the chain (rotating start, skipping providers that failed recently) until one works.
 * To add a keyed provider later, push another object with the same four members into PROVIDERS.
 */
const UA = { 'user-agent': 'JarvisBot/1.0' };
async function http(url, { fetchImpl = fetch, method = 'GET', json, token, ms = 12000 } = {}) {
  const headers = { ...UA, accept: 'application/json' };
  if (json) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetchImpl(url, { method, headers, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const rnd = (n) => crypto.randomBytes(n).toString('hex');
const strip = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function hydraProvider(name, base) {
  return {
    name,
    async create(f) {
      const d = await http(base + '/domains', { fetchImpl: f });
      const dom = (d['hydra:member'] || d.member || []).find((x) => x.isActive !== false)?.domain;
      if (!dom) throw new Error('no domain');
      const address = `${rnd(5)}@${dom}`, password = rnd(12);
      await http(base + '/accounts', { fetchImpl: f, method: 'POST', json: { address, password } });
      const t = await http(base + '/token', { fetchImpl: f, method: 'POST', json: { address, password } });
      if (!t.token) throw new Error('no token');
      return { provider: name, address, token: t.token };
    },
    async inbox(s, f) {
      const j = await http(base + '/messages', { fetchImpl: f, token: s.token });
      return (j['hydra:member'] || j.member || []).map((m) => ({ id: m.id, from: m.from?.address || '', subject: m.subject || '(no subject)', preview: m.intro || '' }));
    },
    async read(s, id, f) {
      const m = await http(base + '/messages/' + encodeURIComponent(id), { fetchImpl: f, token: s.token });
      return { from: m.from?.address || '', subject: m.subject || '', body: m.text || strip(Array.isArray(m.html) ? m.html.join(' ') : m.html) };
    },
  };
}
const guerrilla = {
  name: 'guerrillamail',
  async create(f) {
    const j = await http('https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=en', { fetchImpl: f });
    if (!j.email_addr || !j.sid_token) throw new Error('bad reply');
    return { provider: 'guerrillamail', address: j.email_addr, token: j.sid_token };
  },
  async inbox(s, f) {
    const j = await http(`https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${encodeURIComponent(s.token)}`, { fetchImpl: f });
    return (j.list || []).filter((m) => String(m.mail_from) !== 'no-reply@guerrillamail.com').map((m) => ({ id: m.mail_id, from: m.mail_from || '', subject: m.mail_subject || '(no subject)', preview: m.mail_excerpt || '' }));
  },
  async read(s, id, f) {
    const m = await http(`https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${encodeURIComponent(id)}&sid_token=${encodeURIComponent(s.token)}`, { fetchImpl: f });
    return { from: m.mail_from || '', subject: m.mail_subject || '', body: strip(m.mail_body) };
  },
};
const onesec = {
  name: '1secmail',
  async create(f) {
    const j = await http('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', { fetchImpl: f });
    const address = j?.[0]; if (!/^[^@]+@[^@]+$/.test(address || '')) throw new Error('bad reply');
    return { provider: '1secmail', address, token: '' };
  },
  async inbox(s, f) {
    const [login, domain] = s.address.split('@');
    const j = await http(`https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`, { fetchImpl: f });
    return (j || []).map((m) => ({ id: m.id, from: m.from || '', subject: m.subject || '(no subject)', preview: '' }));
  },
  async read(s, id, f) {
    const [login, domain] = s.address.split('@');
    const m = await http(`https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`, { fetchImpl: f });
    return { from: m.from || '', subject: m.subject || '', body: m.textBody || strip(m.htmlBody) };
  },
};
export const PROVIDERS = [hydraProvider('mail.tm', 'https://api.mail.tm'), guerrilla, hydraProvider('mail.gw', 'https://api.mail.gw'), onesec];
const down = new Map(); // provider name -> retry-after timestamp
let rot = 0;
export async function createMailbox({ fetchImpl = fetch, providers = PROVIDERS, now = Date.now() } = {}) {
  const n = providers.length, start = rot++ % n, errors = [];
  const order = [...providers.slice(start), ...providers.slice(0, start)];
  const live = order.filter((p) => (down.get(p.name) || 0) <= now);
  for (const p of live.length ? live : order) {
    try { const s = await p.create(fetchImpl); down.delete(p.name); return s; }
    catch (e) { down.set(p.name, now + 5 * 60000); errors.push(p.name); }
  }
  throw new Error('all providers failed: ' + errors.join(','));
}
const byName = (name, providers = PROVIDERS) => providers.find((p) => p.name === name);
export const listInbox = (s, { fetchImpl = fetch, providers = PROVIDERS } = {}) => byName(s.provider, providers).inbox(s, fetchImpl);
export const readMail = (s, id, { fetchImpl = fetch, providers = PROVIDERS } = {}) => byName(s.provider, providers).read(s, id, fetchImpl);

export function findCodes(text) {
  const t = String(text || ''); const out = new Set();
  for (const m of t.matchAll(/(?:code|otp|pin|verification|verify|passcode)\D{0,30}(\d{4,8})\b/gi)) out.add(m[1]);
  for (const m of t.matchAll(/\b(\d{4,8})\b\D{0,20}(?:is your|is the)/gi)) out.add(m[1]);
  return [...out].slice(0, 3);
}

// Per-user session store (small JSON file; mailbox credentials are throwaway).
const file = () => path.join(config.paths.data, 'tempmail.json');
let sessions = null;
const load = () => { if (sessions) return sessions; try { sessions = JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { sessions = {}; } return sessions; };
const save = () => { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(sessions)); fs.renameSync(file() + '.tmp', file()); } catch { /* best effort */ } };
export const getSession = (u) => load()[u] || null;
export function setSession(u, s) { load()[u] = { ...s, at: Date.now() }; const k = Object.keys(sessions); if (k.length > 500) delete sessions[k[0]]; save(); }
export function dropSession(u) { const had = !!load()[u]; delete sessions[u]; if (had) save(); return had; }
export const _reset = (f) => { sessions = {}; down.clear(); rot = 0; if (f) { /* tests pass a file via config path */ } };
