import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

// Small crash journal: time + first line of the error message only (no stack, no chat content). Kept in the bot's own data folder.
const file = () => path.join(config.paths.data, 'crashes.json');
const MAX = 20;
export function readCrashes(f = file()) {
  try { const a = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(a) ? a.filter((x) => x && Number.isFinite(x.at)) : []; } catch { return []; }
}
export function recordCrash(err, { f = file(), now = Date.now() } = {}) {
  try {
    const msg = String(err?.message || err || 'unknown').split('\n')[0].replace(/\s+/g, ' ').slice(0, 160);
    const list = [...readCrashes(f), { at: now, msg }].slice(-MAX);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(list)); fs.renameSync(f + '.tmp', f);
  } catch { /* the crash path must never throw */ }
}
/** If the bot has crashed 4+ times in the last 5 minutes, wait before starting again so a restart loop does not hammer WhatsApp. */
export function loopDelayMs(list, now = Date.now()) {
  return list.filter((c) => now - c.at < 5 * 60000).length >= 4 ? 30000 : 0;
}
export function crashText(list, now = Date.now()) {
  if (!list.length) return '✅ No crashes recorded.';
  const day = list.filter((c) => now - c.at < 86400000).length;
  const rows = list.slice(-5).reverse().map((c) => `• ${new Date(c.at).toISOString().replace('T', ' ').slice(0, 16)} UTC - ${c.msg}`);
  return `🛠️ *Crash log*\n${day} in the last 24 h, ${list.length} saved.\n${rows.join('\n')}`;
}
