import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
export const LIMITS = { notes: 50, name: 30, text: 1000 };
let file = () => path.join(config.paths.data, 'notes.json');
let db = null;
const load = () => { if (db) return db; try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } if (!db || typeof db !== 'object') db = {}; return db; };
const save = () => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(db)); fs.renameSync(file() + '.tmp', file()); };
const key = (n) => String(n).trim().toLowerCase().slice(0, LIMITS.name);
export function addNote(user, name, text) {
  const k = key(name), t = String(text || '').trim();
  if (!k || !t) return { error: 'EMPTY' };
  if (t.length > LIMITS.text) return { error: 'LONG' };
  const u = (load()[user] ||= {});
  if (!u[k] && Object.keys(u).length >= LIMITS.notes) return { error: 'FULL' };
  const updated = !!u[k]; u[k] = { text: t, at: Date.now() }; save();
  return { ok: true, updated };
}
export const getNote = (user, name) => load()[user]?.[key(name)]?.text ?? null;
export const listNotes = (user) => Object.keys(load()[user] || {}).sort();
export const allNotes = (user) => load()[user] || {};
export const searchNotes = (user, q) => {
  const needle = String(q || '').toLowerCase(); const u = load()[user] || {}; const out = [];
  for (const [k, v] of Object.entries(u)) if (k.includes(needle) || String(v.text).toLowerCase().includes(needle)) out.push([k, v.text]);
  return out;
};
export function delNote(user, name) {
  const u = load()[user]; const k = key(name);
  if (!u || !u[k]) return false; delete u[k]; if (!Object.keys(u).length) delete db[user]; save(); return true;
}
export const _useFile = (f) => { file = () => f; db = null; };
