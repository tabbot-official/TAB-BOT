// Scheduled group messages: "/schedule 09:00 text" posts every day at that time (bot timezone).
import logger from '../utils/logger.js';
import { store } from './store.js';
import { out, admin as adminQ } from './limiter.js';
import { dueReopens, clearReopen } from './timedmute.js';
import { dropMeta } from './perms.js';

const TZ = process.env.BOT_TZ || 'Asia/Calcutta';
let cron = null;
try { cron = (await import('node-cron')).default; } catch { /* fallback below */ }
let task = null;
let timer = null;

function nowParts() {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { hhmm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, day: `${p.year}-${p.month}-${p.day}` };
}

async function tick(getSock) {
  try {
    const sock = getSock();
    if (!sock || !store()) return;
    for (const gid of dueReopens()) {
      clearReopen(gid);
      try {
        await adminQ.schedule(() => sock.groupSettingUpdate(gid, 'not_announcement'));
        dropMeta(gid);
        await out.schedule(() => sock.sendMessage(gid, { text: '🔓 Timed mute over. Everyone can send messages again.' }));
      } catch (e) { logger.warn(`[groups] auto-unmute failed: ${String(e.message).slice(0, 80)}`); }
    }
    const { hhmm, day } = nowParts();
    for (const s of store().listSchedules()) {
      if (!dueNow(s, hhmm, day)) continue;
      store().markSchedule(s.id, day);
      if (s.date) store().delSchedule(s.gid, s.id); // one-time: remove after it fires
      await out.schedule(() => sock.sendMessage(s.gid, { text: `📅 ${s.text}` })).catch((e) => logger.warn(`[groups] scheduled send failed: ${String(e.message).slice(0, 80)}`));
    }
  } catch (err) {
    logger.warn(`[groups] scheduler error: ${String(err.message).slice(0, 80)}`);
  }
}

export function startScheduler(getSock) {
  if (task || timer) return;
  if (cron) task = cron.schedule('* * * * *', () => tick(getSock), { timezone: TZ });
  else timer = setInterval(() => tick(getSock), 30_000);
  logger.info(`[groups] scheduler running (${cron ? 'node-cron' : 'interval'}, ${TZ})`);
}
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
/** Parse "[days|date] HH:MM text..." -> { hhmm, dow?, date?, rest } or null. Days: mon,wed,fri | weekdays | weekends | daily. */
export function parseWhen(args) {
  const a = [...args]; let dow = null; let date = null;
  const first = (a[0] || '').toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(first) && !Number.isNaN(Date.parse(first))) { date = first; a.shift(); }
  else if (first === 'weekdays') { dow = [1, 2, 3, 4, 5]; a.shift(); }
  else if (first === 'weekends') { dow = [0, 6]; a.shift(); }
  else if (first === 'daily') { a.shift(); }
  else if (/^[a-z]{3}(,[a-z]{3})*$/.test(first) && first.split(',').every((d) => d in DOW)) { dow = [...new Set(first.split(',').map((d) => DOW[d]))]; a.shift(); }
  const t = a.shift();
  if (!validTime(t)) return null;
  return { hhmm: normTime(t), dow, date, rest: a.join(' ').trim() };
}
const dowOf = (day) => new Date(day + 'T12:00:00Z').getUTCDay();
export function dueNow(s, hhmm, day) {
  if (s.hhmm !== hhmm || s.last_day === day) return false;
  if (s.date) return s.date === day;
  if (Array.isArray(s.dow) && s.dow.length) return s.dow.includes(dowOf(day));
  return true;
}
export function describeWhen(s) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (s.date) return `${s.date} ${s.hhmm} (once)`;
  if (Array.isArray(s.dow) && s.dow.length) return `${s.dow.map((d) => names[d]).join(',')} ${s.hhmm}`;
  return `daily ${s.hhmm}`;
}
export const validTime = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t || '');
export const normTime = (t) => t.padStart(5, '0');
