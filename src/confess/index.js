// Confession box store + filters. Senders are remembered (hashed, last 300) ONLY so admins can ban abusers; never shown.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';

export const MAX_LEN = 500;
const file = () => path.join(config.paths.data, 'confess.json');
let db = null; let timer = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } return db; };
const save = () => { if (timer) return; timer = setTimeout(() => { timer = null; try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(db)); } catch { /* best effort */ } }, 2000); timer.unref?.(); };
const g = (gid) => (load()[gid] ||= { n: 0, off: false, banned: [], log: [] });
const h = (user) => crypto.createHash('sha256').update(String(user) + (process.env.CONFESS_SALT || 'jv')).digest('hex').slice(0, 16);

export const isOff = (gid) => g(gid).off;
export const setOff = (gid, off) => { g(gid).off = !!off; save(); };
export const isBanned = (gid, user) => g(gid).banned.includes(h(user));
export function record(gid, user) { const x = g(gid); x.n++; x.log.push({ n: x.n, u: h(user) }); if (x.log.length > 300) x.log.shift(); save(); return x.n; }
export function banByNumber(gid, n) { const x = g(gid); const e = x.log.find((l) => l.n === n); if (!e) return false; if (!x.banned.includes(e.u)) x.banned.push(e.u); save(); return true; }
export function unbanAll(gid) { const c = g(gid).banned.length; g(gid).banned = []; save(); return c; }
export const bannedCount = (gid) => g(gid).banned.length;

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Returns a reason string if the text must be refused, else null. blockwords come from the group's /blockword list. */
export function screen(text, blockwords = []) {
  if (/(?:https?:\/\/|www\.|chat\.whatsapp\.com)/i.test(text)) return 'Links are not allowed in confessions.';
  if (/\b\d[\d\s-]{8,}\d\b/.test(text)) return 'Please do not include phone numbers.';
  const lower = text.toLowerCase();
  for (const w of blockwords) if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc(String(w).toLowerCase())}($|[^\\p{L}\\p{N}])`, 'iu').test(lower)) return 'That confession has a word this group does not allow.';
  return null;
}
export function _reset() { db = {}; }
