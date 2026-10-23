// Tiny XP store for /rankcard. XP only counts in groups, one award per user per minute.
import path from 'node:path';
import config from '../config/config.js';
import { TinyJson } from '../subs/tinyjson.js';

let store = null;
const last = new Map();
function st() { if (!store) store = new TinyJson(path.join(config.paths.data, 'rank.json'), {}); return store; }
export function award(gid, user) {
  const k = gid + '|' + user;
  const now = Date.now();
  if (now - (last.get(k) || 0) < 60000) return;
  last.set(k, now);
  if (last.size > 5000) last.clear();
  const g = (st().data[gid] ||= {});
  g[user] = (g[user] || 0) + 5;
  st().save();
}
export function xpOf(gid, user) { return st().data[gid]?.[user] || 0; }
export function levelOf(xp) { return Math.floor(Math.sqrt(xp / 100)); }
export function nextLevelXp(level) { return (level + 1) * (level + 1) * 100; }
export function rankOf(gid, user) {
  const g = st().data[gid] || {};
  return Object.values(g).filter((x) => x > (g[user] || 0)).length + 1;
}
export function totalMembers(gid) { return Object.keys(st().data[gid] || {}).length; }
