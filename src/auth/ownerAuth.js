import crypto from 'node:crypto';
import settings from '../config/settings.js';

// One-time owner login codes. Codes are kept only as hashes in memory; a restart logs the owner out.
const state = { hash: null, exp: 0, tries: 0, issuedAt: 0, session: 0 };
const sha = (c) => crypto.createHash('sha256').update(String(c)).digest();

export const authEnabled = () => !!settings.auth.enabled;
export const isLoggedIn = () => state.session > Date.now();
export const sessionMinutesLeft = () => Math.max(0, Math.ceil((state.session - Date.now()) / 60000));

/** Returns {code, minutes} or {wait} when a code was issued very recently. */
export function issueCode() {
  const now = Date.now();
  if (state.hash && now - state.issuedAt < 30_000) return { wait: Math.ceil((30_000 - (now - state.issuedAt)) / 1000) };
  const len = Math.min(8, Math.max(4, Number(settings.auth.codeLength) || 6));
  const code = String(crypto.randomInt(0, 10 ** len)).padStart(len, '0');
  const minutes = Math.max(1, Number(settings.auth.codeExpiryMinutes) || 5);
  Object.assign(state, { hash: sha(code), exp: now + minutes * 60_000, tries: 0, issuedAt: now });
  return { code, minutes };
}

/** Returns 'ok' | 'none' | 'expired' | 'locked' | 'wrong'. */
export function verifyCode(input) {
  if (!state.hash) return 'none';
  if (Date.now() > state.exp) { state.hash = null; return 'expired'; }
  const max = Math.max(1, Number(settings.auth.maxAttempts) || 5);
  if (state.tries >= max) { state.hash = null; return 'locked'; }
  const ok = crypto.timingSafeEqual(sha(String(input).trim()), state.hash);
  if (!ok) { state.tries++; return 'wrong'; }
  state.hash = null;
  state.session = Date.now() + Math.max(0.1, Number(settings.auth.sessionHours) || 12) * 3600_000;
  return 'ok';
}

export function logout() { state.session = 0; state.hash = null; }
