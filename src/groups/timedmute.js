// Timed /mute: remembers when each group must reopen, survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = () => path.join(config.paths.data, 'timed-mutes.json');
function load() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } }
function save(d) { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(d)); } catch { /* best effort */ } }

export function parseDuration(s) {
  const m = /^(\d{1,4})\s*(m|min|h|hr|d)?$/i.exec(String(s || '').trim());
  if (!m) return 0;
  const n = Number(m[1]); const u = (m[2] || 'm').toLowerCase();
  const ms = u.startsWith('h') ? n * 3600e3 : u === 'd' ? n * 86400e3 : n * 60e3;
  return ms >= 60e3 && ms <= 7 * 86400e3 ? ms : 0;
}
export function setReopen(gid, at) { const d = load(); d[gid] = at; save(d); }
export function clearReopen(gid) { const d = load(); if (gid in d) { delete d[gid]; save(d); } }
export function dueReopens(now = Date.now()) { return Object.entries(load()).filter(([, t]) => t <= now).map(([g]) => g); }
