// Small per-user and per-chat JSON store for pack commands. Ids are hashed. In-memory fallback when no ctx. Data lives in data/packstore.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const FILE = path.resolve('data/packstore.json');
let db = null; let timer = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = {}; } return db; };
const save = () => { if (timer) return; timer = setTimeout(() => { timer = null; try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch { /* memory only */ } }, 1500); timer.unref?.(); };
const h = (s) => crypto.createHash('sha256').update(String(s || 'anon')).digest('hex').slice(0, 16);
/** bucket(ctx, 'name') -> mutable object kept per user (scope 'user') or per chat (scope 'chat'). */
export function bucket(ctx, name, scope = 'user') {
  const d = load(); const id = scope === 'chat' ? h(ctx?.jid) : h(ctx?.sender || ctx?.senderJid);
  const k = `${scope}:${name}:${id}`; d[k] ||= {}; save(); return d[k];
}
export const flush = () => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db || {})); } catch { /* ignore */ } };
export const allBuckets = () => load();
