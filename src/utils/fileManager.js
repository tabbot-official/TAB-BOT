import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';
import logger from './logger.js';

const JOB_PREFIX = 'job-';
const activeJobs=new Set();

export async function ensureDirs() {
  for (const p of Object.values(config.paths)) await fs.mkdir(p, { recursive: true });
}

export function safeFileName(name, fallback = 'file') {
  const cleaned = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80);
  return cleaned || fallback;
}

/** True only if `target` is strictly inside `parent`. */
export function isInside(parent, target) {
  const rel = path.relative(path.resolve(parent), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Every download gets its own isolated folder under TEMP_FOLDER. */
export async function createJobDir() {
  const dir = path.join(config.paths.temp, `${JOB_PREFIX}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.mkdir(dir, { recursive: true });
  activeJobs.add(path.resolve(dir));
  return dir;
}

/** Removes a job folder. Refuses anything that is not a job folder inside TEMP_FOLDER. */
export async function removeJobDir(dir) {
  if (!dir) return;
  if (!isInside(config.paths.temp, dir) || !path.basename(dir).startsWith(JOB_PREFIX)) {
    logger.warn('Refused to delete a path outside the temp job area');
    return;
  }
  try {
    await fs.rm(dir, { recursive: true, force: true });
    activeJobs.delete(path.resolve(dir));
  } catch (err) {
    logger.warn('Temp cleanup failed:', err);
  }
}

/** Deletes abandoned job folders older than maxAgeMs. */
export async function cleanupStaleJobs(maxAgeMs = config.limits.tempMaxAgeMs) {
  let removed = 0;
  try {
    const entries = await fs.readdir(config.paths.temp, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() || e.isSymbolicLink()) { // stray scratch files (upload/encrypt/convert temp)
        const fp = path.join(config.paths.temp, e.name);
        const fst = await fs.lstat(fp).catch(() => null);
        if (fst && Date.now() - fst.mtimeMs > Math.max(maxAgeMs, 10 * 60 * 1000) ) { await fs.rm(fp, { force: true }).catch(() => {}); removed++; }
        continue;
      }
      if (!e.isDirectory() || !e.name.startsWith(JOB_PREFIX)) continue;
      const full = path.join(config.paths.temp, e.name);
      if(activeJobs.has(path.resolve(full)))continue;
      const st = await fs.lstat(full).catch(() => null);
      if (st && Date.now() - st.mtimeMs > maxAgeMs) {
        await removeJobDir(full);
        removed++;
      }
    }
  } catch (err) {
    logger.warn('Stale temp scan failed:', err);
  }
  if (removed) logger.info(`Cleaned ${removed} abandoned temp folder(s)`);
  return removed;
}

export async function freeDiskBytes(dir = config.paths.temp) {
  try {
    const s = await fs.statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return Infinity; // unknown: do not block
  }
}

export async function dirSize(dir) {
  let total = 0;
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else if(!e.isSymbolicLink()) total += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
    }
  } catch {
    /* ignore */
  }
  return total;
}
