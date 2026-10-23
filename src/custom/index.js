// Custom commands: chat-scoped text commands (e.g. /rules, /upi) made by group admins or the owner.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

export const MAX_PER_CHAT = 30; export const MAX_LEN = 600;
const file = () => path.join(config.paths.data, 'custom-commands.json');
let db = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } return db; };
const save = () => { try { fs.mkdirSync(path.dirname(file()), {recursive: true}); fs.writeFileSync(file() + '.tmp', JSON.stringify(db)); fs.renameSync(file() + '.tmp', file()); } catch { /* best effort */ } };
export const validName = (n) => /^[a-z0-9]{2,20}$/.test(n);
export function add(chat, name, text, taken = () => false) {
  const n = String(name || '').toLowerCase(); const t = String(text || '').trim();
  if (!validName(n)) return 'Name: 2-20 letters or digits.';
  if (taken(n)) return 'That name is already a built-in command.';
  if (t.length < 1 || t.length > MAX_LEN) return `Reply text: 1-${MAX_LEN} characters.`;
  const c = (load()[chat] ||= {});
  if (!c[n] && Object.keys(c).length >= MAX_PER_CHAT) return `Max ${MAX_PER_CHAT} custom commands per chat.`;
  c[n] = t; save(); return null;
}
export function remove(chat, name) { const c = load()[chat]; if (!c || !c[String(name).toLowerCase()]) return false; delete c[String(name).toLowerCase()]; if (!Object.keys(c).length) delete load()[chat]; save(); return true; }
export const list = (chat) => Object.keys(load()[chat] || {}).sort();
export function lookup(chat, name, who = '') { const t = load()[chat]?.[String(name || '').toLowerCase()]; return t ? t.replace(/\{user\}/gi, who || 'friend') : null; }
export function _reset() { db = {}; }
