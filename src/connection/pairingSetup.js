import fs from 'node:fs';
import path from 'node:path';
// Tab: pure helpers for WhatsApp linking (version, browser identity, number format, QR secret).
// Kept free of sockets so they are unit-testable.

// "2.3000.1051488527" or "2,3000,1051488527" -> [2, 3000, 1051488527]; anything else -> null
export function parseVersion(v) {
  const parts = String(v || '').trim().split(/[.,\s]+/).filter(Boolean).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : null;
}

// Order: WA_VERSION env -> live web.whatsapp.com revision -> Baileys' version JSON -> library default.
export async function pickVersion(lib, { env = process.env, log = () => {}, timeoutMs = 10_000 } = {}) {
  const forced = parseVersion(env.WA_VERSION);
  if (forced) return { version: forced, source: 'WA_VERSION' };
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs).unref?.())]);
  if (typeof lib?.fetchLatestWaWebVersion === 'function') {
    try {
      const r = await withTimeout(lib.fetchLatestWaWebVersion({}));
      if (r?.isLatest && parseVersion(r.version?.join?.('.'))) return { version: r.version, source: 'web.whatsapp.com' };
      log('[pairing] web.whatsapp.com version check gave no revision' + (r?.error?.message ? ': ' + r.error.message : ''));
    } catch (e) { log('[pairing] web.whatsapp.com version check failed: ' + (e?.message || e)); }
  }
  if (typeof lib?.fetchLatestBaileysVersion === 'function') {
    try {
      const r = await withTimeout(lib.fetchLatestBaileysVersion());
      if (parseVersion(r?.version?.join?.('.'))) return { version: r.version, source: 'baileys-version.json (may lag WhatsApp Web)' };
    } catch (e) { log('[pairing] Baileys version check failed: ' + (e?.message || e)); }
  }
  return { version: undefined, source: 'library default' };
}

// WA_BROWSER: macos (default) | ubuntu | windows | "OS,Browser,Version" (e.g. "Ubuntu,Chrome,22.04.4").
export function pickBrowser(Browsers, value) {
  const v = String(value || '').trim();
  const custom = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (custom.length === 3) return custom;
  const key = v.toLowerCase();
  const fallback = { macos: ['Mac OS', 'Chrome', '14.4.1'], ubuntu: ['Ubuntu', 'Chrome', '22.04.4'], windows: ['Windows', 'Chrome', '10.0.22631'] };
  const pick = key === 'ubuntu' ? 'ubuntu' : key === 'windows' ? 'windows' : 'macOS';
  try { if (Browsers && typeof Browsers[pick] === 'function') return Browsers[pick]('Chrome'); } catch { /* use fallback */ }
  return fallback[pick.toLowerCase()];
}

// WhatsApp wants country code + national number, digits only: "+91 62903-71061" -> "916290371061".
// A leading "00" international prefix is dropped. Too short/long -> ''.
export function normalizePairingNumber(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d.length >= 8 && d.length <= 15 ? d : '';
}

// QR payload is "https://wa.me/settings/linked_devices#ref,noise,identity,adv,platform".
export function rotateQrAdvSecret(qr, advB64) {
  const s = String(qr || '');
  const i = s.indexOf('#');
  const head = i >= 0 ? s.slice(0, i + 1) : '';
  const fields = (i >= 0 ? s.slice(i + 1) : s).split(',');
  if (fields.length < 5) return s;
  fields[3] = advB64;
  return head + fields.join(',');
}

// ---- WhatsApp 429 rate-overlimit on code requests (Oct 24): remember it on disk so a restart doesn't ask again.

/** True when a Baileys error / error node means WhatsApp's 429 rate-overlimit. */
export function isRateLimitError(err) {
  if (!err) return false;
  const nums = [err.data, err.output?.statusCode, err.statusCode, err.status, err.code, err.data?.attrs?.code];
  if (nums.some((n) => Number(n) === 429)) return true;
  return /rate[-_ ]?overlimit|\b429\b/i.test(String(err.message || err));
}

const RL_FILE = 'pairing-ratelimit.json';
export function rateLimitHours(env = process.env) {
  const h = Number(env.PAIRING_RATELIMIT_HOURS);
  return h > 0 && h <= 48 ? h : 4;
}
export function markPairingRateLimited(dir, reason = '', now = Date.now(), env = process.env) {
  const until = now + rateLimitHours(env) * 3600e3;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, RL_FILE), JSON.stringify({ at: new Date(now).toISOString(), until, reason: String(reason).slice(0, 200) })); } catch { /* best effort */ }
  return until;
}
export function pairingRateLimit(dir, now = Date.now()) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, RL_FILE), 'utf8'));
    const until = Number(j.until) || 0;
    return { active: until > now, until, reason: j.reason || '' };
  } catch { return { active: false, until: 0, reason: '' }; }
}
export function clearPairingRateLimit(dir) { try { fs.rmSync(path.join(dir, RL_FILE), { force: true }); } catch { /* ignore */ } }
