// Self-maintenance: Tab inspects its own folder and cleans junk on owner command.
// Hard rules: the deletable set comes ONLY from junkScan() (fixed junk classes),
// every path must resolve inside the bot's own directory, and a rollback tarball
// is written before anything is removed.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import config from '../config/config.js';
const run = promisify(execFile);

const root = () => process.cwd();
const inside = (p) => { const r = path.resolve(p); return r === root() || r.startsWith(root() + path.sep) ? r : null; };

async function dirSize(p) {
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) stack.push(fp);
      else if (e.isFile()) { try { total += (await fs.promises.lstat(fp)).size; } catch { /* gone */ } }
    }
  }
  return total;
}

// Fixed junk classes - anything outside these is never touched.
export async function junkScan() {
  const R = root();
  const out = [];
  const push = async (rel, kind) => {
    const abs = inside(path.join(R, rel));
    if (!abs) return;
    let st;
    try { st = await fs.promises.lstat(abs); } catch { return; }
    if (st.isSymbolicLink()) return;
    const bytes = st.isDirectory() ? await dirSize(abs) : st.size;
    out.push({ path: abs, rel, kind, bytes });
  };
  let top = [];
  try { top = await fs.promises.readdir(R); } catch { return out; }
  for (const n of top) {
    if (/^src\.bak-/i.test(n)) await push(n, 'old source backup folder');
    if (/^archive-.*\.tar\.gz$/i.test(n)) await push(n, 'file archive');
  }
  // Keep the two newest archives (current rollback + one spare), flag the rest.
  const arch = out.filter((x) => x.kind === 'file archive').sort((a, b) => a.rel.localeCompare(b.rel));
  for (const a of arch.slice(-2)) out.splice(out.indexOf(a), 1);
  // Stray .sXXbak files inside src
  const walk = async (d) => {
    let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) await walk(fp);
      else if (/\.s\d+bak$/i.test(e.name)) await push(path.relative(R, fp), 'leftover backup file');
    }
  };
  await walk(path.join(R, 'src'));
  // Old logs (keep today + last 7 days)
  try {
    const logs = await fs.promises.readdir(path.join(R, 'data', 'logs'));
    const cutoff = Date.now() - 7 * 86400e3;
    for (const n of logs) {
      if (!/^jarvis-\d{4}-\d{2}-\d{2}\.log$/.test(n)) continue;
      const day = new Date(n.slice(7, 17) + 'T00:00:00Z').getTime();
      if (day && day < cutoff) await push(path.join('data', 'logs', n), 'old log');
    }
  } catch { /* no logs dir */ }
  for (const n of ['data/replydebug.log']) await push(n, 'debug log');
  return out.sort((a, b) => b.bytes - a.bytes);
}

export async function listDir(rel = '.') {
  const abs = inside(path.join(root(), rel));
  if (!abs) return null;
  let ents;
  try { ents = await fs.promises.readdir(abs, { withFileTypes: true }); } catch { return null; }
  const rows = [];
  for (const e of ents.slice(0, 200)) {
    const fp = path.join(abs, e.name);
    let bytes = 0;
    if (e.isDirectory()) bytes = await dirSize(fp);
    else { try { bytes = (await fs.promises.lstat(fp)).size; } catch { continue; } }
    rows.push({ name: e.name + (e.isDirectory() ? '/' : ''), bytes });
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
}

// Rollback tarball first, then delete. Only accepts paths from a fresh junkScan.
export async function purgeJunk() {
  const items = await junkScan();
  if (!items.length) return { freed: 0, count: 0, backup: null };
  const backupRel = path.join('data', 'selfclean-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.tar.gz');
  const backupAbs = inside(path.join(root(), backupRel));
  await fs.promises.mkdir(path.dirname(backupAbs), { recursive: true });
  await run('tar', ['czf', backupAbs, ...items.map((i) => i.rel)], { cwd: root(), timeout: 60000 });
  let freed = 0, count = 0;
  for (const i of items) {
    const abs = inside(i.path);
    if (!abs) continue;
    await fs.promises.rm(abs, { recursive: true, force: true }).catch(() => {});
    freed += i.bytes; count++;
  }
  return { freed, count, backup: backupRel };
}

export async function purgeBackups() {
  const dir = path.join(root(), 'data');
  let n = 0, bytes = 0;
  try {
    for (const f of await fs.promises.readdir(dir)) {
      if (!/^selfclean-.*\.tar\.gz$/.test(f)) continue;
      const fp = path.join(dir, f);
      bytes += (await fs.promises.lstat(fp)).size;
      await fs.promises.rm(fp, { force: true });
      n++;
    }
  } catch { /* none */ }
  return { n, bytes };
}
export const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';
