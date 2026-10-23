// Daily activity log per group: foundation for weekly report, lurker kicker and chat wrapped.
// Small by design: one counter per member per day (90 days kept) + hour histogram per group.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const KEEP_DAYS = 90;
const TZ = process.env.BOT_TZ || 'Asia/Calcutta';
let d = null; let timer = null;
const file = () => path.join(config.paths.data, 'activity.json');
const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
const hourOf = (t = Date.now()) => Number(new Date(t).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24;

function load() {
  if (d) return d;
  try { d = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { d = {}; }
  return d;
}
function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(d)); } catch { /* best effort */ }
  }, 5000);
  timer.unref?.();
}
function prune(g) {
  const cut = dayKey(Date.now() - KEEP_DAYS * 86400e3);
  for (const k of Object.keys(g.days)) if (k < cut) delete g.days[k];
}
export function record(gid, user, now = Date.now()) {
  const db = load();
  const g = (db[gid] ||= { days: {}, hours: Array(24).fill(0), last: {}, join: {} });
  const k = dayKey(now);
  const day = (g.days[k] ||= {});
  day[user] = (day[user] || 0) + 1;
  g.hours[hourOf(now)]++;
  g.last[user] = now;
  if (Math.random() < 0.01) prune(g);
  save();
}
export function markJoin(gid, user, now = Date.now()) { const g = (load()[gid] ||= { days: {}, hours: Array(24).fill(0), last: {}, join: {} }); g.join[user] = now; save(); }
export function lastSeen(gid, user) { return load()[gid]?.last?.[user] || 0; }
export function topUsers(gid, days = 7, n = 5, now = Date.now()) {
  const g = load()[gid]; if (!g) return [];
  const from = dayKey(now - (days - 1) * 86400e3); const tot = {};
  for (const [k, m] of Object.entries(g.days)) if (k >= from) for (const [u, c] of Object.entries(m)) tot[u] = (tot[u] || 0) + c;
  return Object.entries(tot).map(([user, msgs]) => ({ user, msgs })).sort((a, b) => b.msgs - a.msgs).slice(0, n);
}
export function dailyTotals(gid, days = 7, now = Date.now()) {
  const g = load()[gid]; const out = [];
  for (let i = days - 1; i >= 0; i--) { const k = dayKey(now - i * 86400e3); out.push({ day: k, msgs: Object.values(g?.days?.[k] || {}).reduce((a, b) => a + b, 0) }); }
  return out;
}
export function busiestHour(gid) {
  const h = load()[gid]?.hours; if (!h) return null;
  const max = Math.max(...h); return max > 0 ? h.indexOf(max) : null;
}
/** Members (from the given list) with no message for `days` days. Never-seen members count from tracking start or join time. */
export function inactive(gid, members, days, now = Date.now()) {
  const g = load()[gid]; const cut = now - days * 86400e3; 
  return members.filter((u) => { const l = g?.last?.[u] || g?.join?.[u] || 0; return l < cut && (l > 0 || now - trackingStart(gid) >= days * 86400e3); });
}
export function trackingStart(gid) {
  const g = (load()[gid] ||= { days: {}, hours: Array(24).fill(0), last: {}, join: {} });
  if (!g.since) { g.since = Date.now(); save(); }
  return g.since;
}
export function _reset() { d = {}; }
/** Per-day member counters for the last `days` days (read-only copy), plus the hour histogram. */
export function range(gid, days = 30, now = Date.now()) {
  const g = load()[gid]; if (!g) return {days: {}, hours: Array(24).fill(0)};
  const from = dayKey(now - (days - 1) * 86400e3); const out = {};
  for (const [k, m] of Object.entries(g.days)) if (k >= from) out[k] = {...m};
  return {days: out, hours: [...g.hours]};
}
