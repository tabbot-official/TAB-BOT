// Pairing-portal client. It only talks to the portal URL you set in settings.js (ecosystem.portalUrl).
// Nothing runs unless ecosystem.portalUrl AND ecosystem.ticket are both set. No phone number, code or S-ID is logged.
import fs from 'node:fs';
import path from 'node:path';

const SID = /^S-[A-Z0-9]{6}$/;
export const PROOF_PREFIX = 'JARVIS-PROOF ';
export const safeUrl = (u) => { try { const x = new URL(String(u || '')); return (x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))) ? x.origin + x.pathname.replace(/\/$/, '') : ''; } catch { return ''; } };
/** Tab: no default portal. Upstream Jarvis defaulted to the maintainer's server (https://3-110-115-23.sslip.io/portal), which receives the
 *  WhatsApp pairing code and can hand back a WhatsApp session. In Tab the portal is used ONLY if you set ecosystem.portalUrl yourself. */
export const DEFAULT_PORTAL = '';
const CODE = /^[A-Z0-9]{8}$/;
export const cleanCode = (c) => { const x = String(c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); return CODE.test(x) ? x : ''; };
const ticketFile = (dir) => path.join(dir, 'ecosystem-ticket.json');
export function loadTicket(dir) { try { const j = JSON.parse(fs.readFileSync(ticketFile(dir), 'utf8')); return j.token && j.number ? {token: String(j.token), number: String(j.number)} : null; } catch { return null; } }
export function saveTicket(dir, token, number) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(ticketFile(dir), JSON.stringify({token, number, savedAt: Date.now()}), {mode: 0o600}); }
/** Trades the short code from the pairing page for a ticket and stores it in data/ (no file editing). Only the code and your number go to the portal. */
export async function redeemCode({eco, dir, code, number, fetchFn = globalThis.fetch}) {
  const base = safeUrl(eco.portalUrl) || DEFAULT_PORTAL, c = cleanCode(code), n = String(number || '').replace(/\D/g, '');
  if (!base) return {ok: false, why: 'No pairing portal is configured (Tab does not use the Jarvis maintainer portal). Link with the WhatsApp pairing code instead.'};
  if (!c) return {ok: false, why: 'That code does not look right. It has 8 letters and numbers, like K7QM-4X2P.'};
  if (n.length < 8 || n.length > 15) return {ok: false, why: 'Could not read your number.'};
  try {
    const r = await fetchFn(base + '/pair/redeem', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code: c, number: n}), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({}));
    if (!j.success || !j.data?.token) return {ok: false, why: j.error?.message || 'The portal did not accept that code.'};
    saveTicket(dir, j.data.token, n); eco.portalUrl = base; eco.ticket = j.data.token; eco.number = n; return {ok: true};
  } catch { return {ok: false, why: 'The pairing service is not reachable right now. Try again in a minute.'}; }
}
/** Maintainer install only (PORTAL_URL + PORTAL_PROOF_KEY in the environment): asks the portal for a one-time code for ANOTHER number. The key never leaves the environment. */
export async function mintCode({env = process.env, number, fetchFn = globalThis.fetch}) {
  const base = safeUrl(env.PORTAL_URL), key = env.PORTAL_PROOF_KEY || '', n = String(number || '').replace(/\D/g, '');
  if (!base || !key) return {ok: false, why: 'Making codes for other numbers only works on the maintainer bot.'};
  if (n.length < 10 || n.length > 15) return {ok: false, why: 'Send the number with country code, digits only, like /pair 919876543210.'};
  try {
    const r = await fetchFn(base + '/pair/mint', {method: 'POST', headers: {'content-type': 'application/json', 'x-proof-key': key}, body: JSON.stringify({number: n}), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({}));
    return j.success && j.data?.short ? {ok: true, short: j.data.short, minutes: j.data.shortMinutes || 15} : {ok: false, why: j.error?.message || 'The portal did not make a code.'};
  } catch { return {ok: false, why: 'The pairing service is not reachable right now.'}; }
}
/** Lets the /pair command reach the live socket without a circular import. */
export const bridge = {start: null};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saved portal S-ID (data/ecosystem.json) so it survives restarts without editing settings.js. */
export function loadSaved(dir) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.json'), 'utf8')); return SID.test(j.sid) ? j.sid : ''; } catch { return ''; } }
export function saveSid(dir, sid, key = '') { fs.mkdirSync(dir, {recursive: true}); let old = {}; try { old = JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.json'), 'utf8')); } catch { /* new file */ } fs.writeFileSync(path.join(dir, 'ecosystem.json'), JSON.stringify({sid, key: key || (old.sid === sid ? old.key : '') || '', savedAt: Date.now()}), {mode: 0o600}); }
export function loadKey(dir) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.json'), 'utf8')); return /^K-[A-Za-z0-9_-]{20,80}$/.test(j.key || '') ? j.key : ''; } catch { return ''; } }

export function createPairing({eco, dir, fetchFn = globalThis.fetch, sendText, sendSelf, log = () => {}, pollMs = 3000, maxPolls = 100, applySid = () => {}}) {
  const live = () => ({base: safeUrl(eco.portalUrl) || (eco.ticket ? DEFAULT_PORTAL : ''), token: String(eco.ticket || ''), number: String(eco.number || '').replace(/\D/g, '')});
  const active = () => { const l = live(); return !!(l.base && l.token && l.number); };
  async function post(p, body) {
    const r = await fetchFn(live().base + p, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({})); if (!j.success) throw new Error(j.error?.code || 'portal_error'); return j.data;
  }
  /** Called with the WhatsApp pairing code right after it is created. Only the code, ticket and number go to the portal. */
  async function relayCode(code) { if (!active() || loadSaved(dir)) return false; try { await post('/pair/bot/code', {token: live().token, number: live().number, code}); return true; } catch (e) { log('portal code relay failed: ' + e.message); return false; } }
  /** Called once WhatsApp is connected. Proves the link, waits for the portal, then DMs the S-ID to your own chat. */
  async function onLinked() {
    if (!active() || loadSaved(dir)) return null;
    try {
      const l = await post('/pair/bot/linked', {token: live().token, number: live().number});
      if (l.proof && l.proofTo) await sendText(l.proofTo, PROOF_PREFIX + l.proof);
      for (let i = 0; i < maxPolls; i++) {
        const s = await post('/pair/bot/status', {token: live().token});
        if (s.status === 'verified' && SID.test(s.sid || '')) { saveSid(dir, s.sid, s.key || ''); applySid(s.sid); await sendSelf(`Tab\nYour Tab S-ID is ${s.sid}.\nKeep it private. Type /sid any time to see it.`); return s.sid; }
        await sleep(pollMs);
      }
    } catch (e) { log('portal link failed: ' + e.message); }
    return null;
  }
  return {active, relayCode, onLinked};
}

/** Maintainer install only (PORTAL_URL and PORTAL_PROOF_KEY in the environment): forwards a received proof message to the portal. */
export function createProofRelay({env = process.env, fetchFn = globalThis.fetch, log = () => {}} = {}) {
  const base = safeUrl(env.PORTAL_URL), key = env.PORTAL_PROOF_KEY || '';
  return async function relay(text, fromNumber) {
    if (!base || !key) return false;
    const m = /^JARVIS-PROOF ([A-Za-z0-9_-]{8,64})$/.exec(String(text || '').trim()); const from = String(fromNumber || '').replace(/\D/g, '');
    if (!m || from.length < 8 || from.length > 15) return false;
    try { const r = await fetchFn(base + '/pair/proof', {method: 'POST', headers: {'content-type': 'application/json', 'x-proof-key': key}, body: JSON.stringify({proof: m[1], from}), signal: AbortSignal.timeout(15000)}); return r.ok; } catch (e) { log('proof relay failed'); return false; }
  };
}

/** Maintainer install only: while WhatsApp is really connected, tells the portal "online" every few minutes (version only, no personal data). */
export function createHeartbeat({env = process.env, fetchFn = globalThis.fetch, version = '', intervalMs = 300000, log = () => {}} = {}) {
  const base = safeUrl(env.PORTAL_URL), key = env.PORTAL_PROOF_KEY || '';
  let timer = null, connected = false;
  const beat = async () => {
    if (!connected || !base || !key) return false;
    try { const r = await fetchFn(base + '/bot/heartbeat', {method: 'POST', headers: {'content-type': 'application/json', 'x-proof-key': key}, body: JSON.stringify({version: String(version || '')}), signal: AbortSignal.timeout(10000)}); return r.ok; } catch { log('heartbeat failed'); return false; }
  };
  return {
    beat,
    setConnected(v) {
      connected = !!v;
      if (!base || !key) return;
      if (connected && !timer) { beat(); timer = setInterval(beat, intervalMs); timer.unref?.(); }
      if (!connected && timer) { clearInterval(timer); timer = null; }
    },
  };
}

// ---- Status beat (paired installs only) ----
let cmdDay = '', cmdCount = 0;
/** Counts commands run today (a number only). Called by the command handler. */
export function noteCommand(now = new Date()) { const d = now.toISOString().slice(0, 10); if (d !== cmdDay) { cmdDay = d; cmdCount = 0; } cmdCount++; }
export const commandsToday = (now = new Date()) => (now.toISOString().slice(0, 10) === cmdDay ? cmdCount : 0);
/** After pairing, tells the portal "online" with counters only (version, hosting type, uptime, commands today, memory). No chats, numbers or contents.
 *  Off when settings ecosystem.statusBeat is false or env STATUS_BEAT=off. Needs the S-ID and the install key saved at pairing. */
export function createStatusBeat({eco, dir, env = process.env, fetchFn = globalThis.fetch, version = '', hosting = () => 'unknown', intervalMs = 300000, log = () => {}} = {}) {
  let timer = null, connected = false;
  const off = () => eco.statusBeat === false || String(env.STATUS_BEAT || '').toLowerCase() === 'off';
  const ready = () => { const base = safeUrl(eco.portalUrl) || DEFAULT_PORTAL, sid = loadSaved(dir), key = loadKey(dir); return !off() && base && connected && sid && key ? {base, sid, key} : null; };
  const beat = async () => {
    const r = ready(); if (!r) return false;
    try {
      const res = await fetchFn(r.base + '/pair/beat', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({sid: r.sid, key: r.key, version, hosting: hosting(), uptimeSec: Math.round(process.uptime()), commandsToday: commandsToday(), ramMb: Math.round(process.memoryUsage().rss / 1048576)}), signal: AbortSignal.timeout(10000)});
      return res.ok;
    } catch { log('status beat failed'); return false; }
  };
  return {
    beat,
    setConnected(v) {
      connected = !!v;
      if (connected && !timer) { beat(); timer = setInterval(beat, intervalMs); timer.unref?.(); }
      if (!connected && timer) { clearInterval(timer); timer = null; }
    },
    afterPair() { if (connected) beat(); },
  };
}

/** Panel bot start: if there is no WhatsApp login yet but settings hold your number and S-ID, collect the session the pairing website
 * prepared for you (single use, kept on the portal for at most 30 minutes) so you do not link a second time. Only your number and S-ID are sent.
 * Off with ecosystem.autoPair:false. If nothing is waiting, the bot falls back to its own link code as before. */
export async function claimSession({eco, authDir, dataDir, fetchFn = globalThis.fetch}) {
  try {
    if (eco.autoPair === false || !SID.test(eco.sid || '') || String(eco.number || '').replace(/\D/g, '').length < 10) return {ok: false, why: 'not_configured'};
    if (fs.existsSync(path.join(authDir, 'creds.json'))) return {ok: false, why: 'already_logged_in'};
    const base = safeUrl(eco.portalUrl) || DEFAULT_PORTAL;
    if (!base) return {ok: false, why: 'not_configured'};
    const r = await fetchFn(base + '/pair/handoff', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({number: String(eco.number).replace(/\D/g, ''), sid: eco.sid}), signal: AbortSignal.timeout(20000)});
    const j = await r.json().catch(() => ({}));
    if (!j.success || !j.data?.blob) return {ok: false, why: j.error?.code || 'none_waiting'};
    const pack = JSON.parse(j.data.blob); const names = Object.keys(pack.files || {});
    if (pack.v !== 1 || !names.length || names.length > 2000 || !names.includes('creds.json')) return {ok: false, why: 'bad_session'};
    fs.mkdirSync(authDir, {recursive: true, mode: 0o700});
    for (const n of names) { if (!/^[A-Za-z0-9._-]{1,120}$/.test(n) || n.startsWith('.')) return {ok: false, why: 'bad_session'}; const buf = Buffer.from(String(pack.files[n]), 'base64'); if (buf.length > 5e6) return {ok: false, why: 'bad_session'}; fs.writeFileSync(path.join(authDir, n), buf, {mode: 0o600}); }
    saveSid(dataDir, eco.sid, j.data.key || '');
    return {ok: true};
  } catch { return {ok: false, why: 'unreachable'}; }
}
