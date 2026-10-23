// Bot runtime facts. Only safe, aggregate values: no credentials, no session files, no phone numbers.
import fs from 'node:fs';
import {snapshot} from '../../utils/botstats.js';
const version = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version; } catch { return '0'; } })();
let registry = null;
export const setRegistry = (r) => { registry = r; };
export const getRegistry = () => registry;
export const connection = () => globalThis.__jarvisWA === 'online' ? 'online' : (globalThis.__jarvisWA || 'unknown');
export const status = () => ({online: connection() === 'online', connection: connection(), version, uptimeSec: Math.floor(process.uptime()), node: process.version, commands: registry?.list ? registry.list().length : null});
export async function runtime() {
  const s = await snapshot(registry || {list: () => []});
  return {...status(), ramUsedBytes: s.ramUsed, ramLimitBytes: s.ramLimit, cpuPct: s.cpuPct, diskFreeBytes: s.diskFree, totalCommands: s.totalCommands, failures: s.failures};
}
export function scheduleRestart(delayMs = 800) { const t = setTimeout(() => process.exit(0), delayMs); t.unref?.(); return true; } // the host supervisor restarts the container
