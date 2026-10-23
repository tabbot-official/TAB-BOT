// Stats shared by /status and the web dashboard. Numbers only: no secrets, no logs, no chat content.
import os from 'node:os';
import fs from 'node:fs';
import config from '../config/config.js';
import { getStats, getUsage, getRecent } from '../database/database.js';
import { freeDiskBytes } from './fileManager.js';

let last = { cpu: process.cpuUsage(), at: Date.now(), pct: 0 };
const timer = setInterval(() => {
  const now = Date.now();
  const u = process.cpuUsage(last.cpu);
  const ms = Math.max(1, now - last.at);
  last = { cpu: process.cpuUsage(), at: now, pct: Math.min(100, ((u.user + u.system) / 1000 / ms) * 100) };
}, 5000);
timer.unref?.();

function readNum(file) {
  try {
    const v = fs.readFileSync(file, 'utf8').trim();
    return v === 'max' ? null : Number(v);
  } catch { return null; }
}

export function ist(ts = Date.now()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts);
}
export function istFull(ts = Date.now()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ts);
}

export async function snapshot(registry) {
  const stats = getStats();
  const usage = Object.entries(getUsage()).sort((a, b) => b[1] - a[1]);
  const cmds = registry?.list ? registry.list().filter((c) => !c.hidden) : [];
  const limit = readNum('/sys/fs/cgroup/memory.max') ?? readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const rss = process.memoryUsage().rss;
  const free = await freeDiskBytes().catch(() => NaN);
  return {
    now: Date.now(),
    botName: config.botName,
    wa: globalThis.__jarvisWA || 'unknown',
    uptimeSec: Math.round(process.uptime()),
    plugins: cmds.length,
    totalCommands: stats.commands || 0,
    downloads: stats.downloads || 0,
    failures: stats.failures || 0,
    usage,
    recent: getRecent(),
    ramUsed: rss,
    ramLimit: limit && limit < 1e13 ? limit : os.totalmem(),
    cpuPct: Math.round(last.pct * 10) / 10,
    load: os.loadavg()[0],
    diskFree: Number.isFinite(free) ? free : null,
  };
}
