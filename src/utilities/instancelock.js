// Single-instance lock: two Tab processes on the same auth dir fight over the
// WhatsApp session and get each other logged out (code 440). This refuses a second start.
// Tab (Oct 24): containers reuse pids. After a panel restart the old pid in data/jarvis.pid can belong to
// tab-start.cjs, npm, a shell, or our own parent, so "pid alive" alone wrongly refused to start. The lock is
// held only when that pid is (a) not us or one of our ancestors, (b) on Linux, a node process running the bot
// (scripts/runner.js or index.js), and (c) the same process that wrote the lock (its start time matches).
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = () => path.join(config.paths.data, 'jarvis.pid');
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } }

const procOk = () => process.platform === 'linux' && fs.existsSync('/proc/self/stat');
/** /proc/<pid>/stat -> { ppid, start } (start = clock ticks since boot), or null. */
export function procStat(pid, read = fs.readFileSync) {
  try {
    const raw = String(read(`/proc/${pid}/stat`, 'utf8'));
    const rest = raw.slice(raw.lastIndexOf(')') + 2).split(' '); // fields after "(comm)": state ppid ... starttime is field 22
    return { ppid: Number(rest[1]), start: Number(rest[19]) };
  } catch { return null; }
}
export function procCmdline(pid, read = fs.readFileSync) {
  try { return String(read(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean); } catch { return null; }
}
export function ancestors(pid = process.pid, read = fs.readFileSync) {
  const out = new Set(); let cur = pid;
  for (let i = 0; i < 64; i++) {
    const st = procStat(cur, read); if (!st || !st.ppid || out.has(st.ppid)) break;
    out.add(st.ppid); cur = st.ppid;
  }
  if (process.ppid) out.add(process.ppid);
  return out;
}
/** A node process running the bot itself (not tab-start.cjs, npm, sh, a test runner...). */
export function looksLikeBot(argv) {
  if (!argv || !argv.length) return false;
  if (!/(^|\/)node(js)?(\.exe)?$|(^|\/)node\d*$/i.test(argv[0])) return false;
  const script = argv.slice(1).find((a) => !a.startsWith('-')) || '';
  return /(^|\/)(scripts\/runner\.js|src\/index\.js|index\.js)$/.test(script);
}
export function parseLock(text) {
  const [pid, start] = String(text || '').trim().split(/\s+/).map(Number);
  return { pid: Number.isInteger(pid) && pid > 0 ? pid : 0, start: Number.isFinite(start) && start > 0 ? start : 0 };
}

/** Why the lock file does NOT block us ('' = it does block: another live bot holds it). */
export function staleReason(lock, { self = process.pid, isAlive = alive, linux = procOk(), read = fs.readFileSync, mtimeMs = 0, bootMs = 0, hz = 100 } = {}) {
  if (!lock.pid) return 'empty';
  if (lock.pid === self) return 'ours';
  if (!isAlive(lock.pid)) return 'dead';
  if (!linux) return '';
  if (ancestors(self, read).has(lock.pid)) return 'ancestor (pid reused by our own parent)';
  const st = procStat(lock.pid, read);
  if (lock.start && st && st.start && st.start !== lock.start) return 'pid reused (start time differs)';
  const argv = procCmdline(lock.pid, read);
  if (argv && !looksLikeBot(argv)) return 'pid reused by a non-bot process: ' + argv.slice(0, 2).join(' ').slice(0, 60);
  // Old-format lock (pid only): a process that started after the lock was written cannot be the writer.
  if (!lock.start && st && st.start && mtimeMs && bootMs && bootMs + (st.start / hz) * 1000 > mtimeMs + 2000) return 'pid reused (process younger than the lock)';
  return '';
}

function bootTimeMs() {
  try { const m = /^btime (\d+)/m.exec(fs.readFileSync('/proc/stat', 'utf8')); return m ? Number(m[1]) * 1000 : 0; } catch { return 0; }
}

export function acquireLock({ log = () => {} } = {}) {
  try {
    fs.mkdirSync(config.paths.data, { recursive: true });
    const raw = fs.readFileSync(file(), 'utf8');
    const lock = parseLock(raw);
    let mtimeMs = 0; try { mtimeMs = fs.statSync(file()).mtimeMs; } catch {}
    const why = staleReason(lock, { mtimeMs, bootMs: bootTimeMs() });
    if (!why) return false;
    if (why !== 'ours' && why !== 'empty') log(`[lock] ignoring stale lock (pid ${lock.pid}: ${why})`);
  } catch { /* no lock file */ }
  try {
    const st = procOk() ? procStat(process.pid) : null;
    fs.writeFileSync(file(), String(process.pid) + (st?.start ? ' ' + st.start : ''));
  } catch { /* best effort */ }
  return true;
}
export function releaseLock() {
  try { if (parseLock(fs.readFileSync(file(), 'utf8')).pid === process.pid) fs.rmSync(file(), { force: true }); } catch {}
}
process.on('exit', releaseLock);
