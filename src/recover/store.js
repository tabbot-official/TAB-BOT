// Disk cache for recoverable content: recent messages, statuses and view-once media.
// Everything is size capped and expires, so the small host disk stays safe.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const HOUR = 3600_000;
export const LIMITS = {
  maxTotal: 80 * 1024 * 1024,
  maxFile: 20 * 1024 * 1024,
  ttl: { msg: 48 * HOUR, status: 25 * HOUR, vo: 48 * HOUR },
  maxEntries: 3000,
};
const dir = () => path.join(config.paths.data, 'recover');
const indexFile = () => path.join(dir(), 'index.json');
const settingsFile = () => path.join(dir(), 'settings.json');

const DEFAULTS = { antidelete: true, groups: true, status: true, vo: true, antiedit: true };
let settings = { ...DEFAULTS };
const index = new Map();
let deletedLog = [];
let timer = null;

export function init() {
  try { fs.mkdirSync(path.join(dir(), 'f'), { recursive: true }); } catch { /* ignore */ }
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* first run */ }
  try {
    const d = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    for (const e of d.entries || []) index.set(e.id, e);
    deletedLog = d.deleted || [];
  } catch { /* first run */ }
  prune();
}

function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(indexFile(), JSON.stringify({ entries: [...index.values()], deleted: deletedLog }));
    } catch { /* best effort */ }
  }, 2000);
  timer.unref?.();
}

export const getSettings = () => ({ ...settings });
export function setSetting(k, v) {
  if (!(k in DEFAULTS)) return false;
  settings[k] = !!v;
  try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch { /* ignore */ }
  return true;
}

const filePath = (e) => (e.file && /^[A-Za-z0-9-]+\.bin$/.test(e.file) ? path.join(dir(), 'f', e.file) : null);
function dropFile(e) { const p = filePath(e); if (p) fs.rm(p, { force: true }, () => {}); }

export function add(entry, buf) {
  const e = { ...entry, ts: entry.ts || Date.now() };
  if (buf?.length && buf.length <= LIMITS.maxFile) {
    e.file = `${e.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}-${Date.now().toString(36)}.bin`;
    e.size = buf.length;
    try { fs.mkdirSync(path.join(dir(), 'f'), { recursive: true }); fs.writeFileSync(filePath(e), buf); } catch { delete e.file; }
  }
  index.set(e.id, e);
  prune();
  save();
  return e;
}

export const get = (id) => index.get(id) || null;
export function readFile(e) {
  const p = filePath(e);
  if (!p) return null;
  try { return fs.readFileSync(p); } catch { return null; }
}

export function list(pred = () => true) {
  return [...index.values()].filter(pred).sort((a, b) => b.ts - a.ts);
}

export function markDeleted(id) {
  const e = index.get(id);
  if (!e) return null;
  e.deleted = true;
  e.deletedAt = Date.now();
  deletedLog.push(id);
  if (deletedLog.length > 50) deletedLog.shift();
  save();
  return e;
}
export const deletedEntries = () => deletedLog.map((id) => index.get(id)).filter(Boolean).reverse();

export function totalBytes() {
  let n = 0;
  for (const e of index.values()) n += e.size || 0;
  return n;
}

export function prune(now = Date.now()) {
  for (const e of [...index.values()]) {
    const ttl = LIMITS.ttl[e.kind] || LIMITS.ttl.msg;
    if (now - e.ts > ttl) { dropFile(e); index.delete(e.id); }
  }
  let total = totalBytes();
  if (total > LIMITS.maxTotal || index.size > LIMITS.maxEntries) {
    for (const e of [...index.values()].sort((a, b) => a.ts - b.ts)) {
      if (total <= LIMITS.maxTotal * 0.9 && index.size <= LIMITS.maxEntries) break;
      total -= e.size || 0;
      dropFile(e);
      index.delete(e.id);
    }
  }
  save();
}

export const stats = () => ({ entries: index.size, bytes: totalBytes(), statuses: list((e) => e.kind === 'status').length, viewOnce: list((e) => e.kind === 'vo').length, deleted: deletedLog.length });
