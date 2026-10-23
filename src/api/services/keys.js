// API keys: only a SHA-256 hash is stored; the key itself is shown once at creation. Roles: owner > admin > service > readonly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../../config/config.js';

export const ROLES = ['readonly', 'service', 'admin', 'owner'];
export const hasRole = (have, need) => ROLES.indexOf(have) >= ROLES.indexOf(need) && ROLES.indexOf(have) >= 0;
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');
const file = () => path.join(config.paths.data, 'api-keys.json');
const load = () => { try { const d = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(d) ? d : []; } catch { return []; } };
const save = (l) => { fs.mkdirSync(path.dirname(file()), {recursive: true}); fs.writeFileSync(file() + '.tmp', JSON.stringify(l), {mode: 0o600}); fs.renameSync(file() + '.tmp', file()); };

export function createKey(name, role = 'readonly') {
  if (!ROLES.includes(role)) throw new Error('role');
  const l = load(); if (l.length >= 50) throw new Error('limit');
  const key = 'jv_' + crypto.randomBytes(24).toString('base64url'); const id = crypto.randomBytes(4).toString('hex');
  l.push({id, name: String(name || 'key').slice(0, 40), role, hash: hash(key), created: Date.now(), lastUsed: 0}); save(l);
  return {id, key, role};
}
export function findKey(key) {
  if (typeof key !== 'string' || key.length < 20 || key.length > 80) return null;
  const h = Buffer.from(hash(key));
  const hit = load().find((k) => { const b = Buffer.from(k.hash); return b.length === h.length && crypto.timingSafeEqual(b, h); });
  return hit ? {id: hit.id, name: hit.name, role: hit.role} : null;
}
export const listKeys = () => load().map(({id, name, role, created, lastUsed}) => ({id, name, role, created, lastUsed}));
export function revokeKey(id) { const l = load(); const n = l.filter((k) => k.id !== id); if (n.length === l.length) return false; save(n); return true; }
