// Encrypted auth backup. Periodically snapshots the WhatsApp session files into
// data/auth-backup.enc (AES-256-GCM). The key comes ONLY from the panel .env
// (JARVIS_AUTH_BACKUP_KEY) - it is never in code. Restore happens only when the
// live auth dir is missing or corrupted, never over a healthy session.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';
import logger from '../utils/logger.js';

const key = () => {
  const k = String(process.env.JARVIS_AUTH_BACKUP_KEY || '').trim();
  return k.length >= 16 ? crypto.createHash('sha256').update(k).digest() : null;
};
const authDir = () => config.paths?.auth || path.join(process.cwd(), 'auth');
const outFile = () => path.join(config.paths.data, 'auth-backup.enc');

const revokedFile = () => path.join(config.paths.data, 'auth-revoked.json');
export function markRevoked(reason) {
  try { fs.mkdirSync(config.paths.data, { recursive: true }); fs.writeFileSync(revokedFile(), JSON.stringify({ at: Date.now(), reason: String(reason || 'loggedOut').slice(0, 120) }), { mode: 0o600 }); } catch { /* best effort */ }
}
export function clearRevoked() { try { fs.rmSync(revokedFile(), { force: true }); } catch { /* best effort */ } }
export function isRevoked() { try { fs.lstatSync(revokedFile()); return true; } catch { return false; } }

export function backupNow() {
  const k = key();
  if (!k) return false;
  try {
    const dir = authDir();
    if (!fs.existsSync(path.join(dir, 'creds.json'))) return false;
    const files = {};
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { files[f] = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { /* skip */ }
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(files), 'utf8'), cipher.final()]);
    const payload = JSON.stringify({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: enc.toString('base64url'), at: Date.now() });
    fs.mkdirSync(config.paths.data, { recursive: true });
    fs.writeFileSync(outFile() + '.tmp', payload, { mode: 0o600 });
    fs.renameSync(outFile() + '.tmp', outFile());
    return true;
  } catch (e) { logger.warn('[authbackup] backup failed: ' + (e?.message || 'error')); return false; }
}

/** Restore only when creds are missing or unreadable. Returns true if restored. */
export function restoreIfNeeded() {
  const k = key();
  if (!k) return false;
  // Never resurrect a session WhatsApp explicitly revoked: restoring it only loops logouts.
  if (isRevoked()) { logger.warn('[authbackup] restore skipped: session was revoked (logged out) - fresh pairing required'); return false; }
  const dir = authDir();
  try {
    const raw = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
    JSON.parse(raw);
    return false; // healthy session - never touch it
  } catch { /* missing or corrupt: try restore */ }
  try {
    const p = JSON.parse(fs.readFileSync(outFile(), 'utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(p.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(p.tag, 'base64url'));
    const files = JSON.parse(Buffer.concat([decipher.update(Buffer.from(p.data, 'base64url')), decipher.final()]).toString('utf8'));
    if (!files['creds.json']) return false;
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      if (!/^[\w.-]+\.json$/.test(name)) continue;
      fs.writeFileSync(path.join(dir, name), content, { mode: 0o600 });
    }
    logger.warn('[authbackup] session restored from encrypted backup');
    return true;
  } catch (e) { logger.warn('[authbackup] restore failed: ' + (e?.message || 'error')); return false; }
}

let timer = null;
export function startAuthBackup() {
  if (!key()) { logger.info('[authbackup] no JARVIS_AUTH_BACKUP_KEY in .env - encrypted session backup off'); return; }
  if (timer) return;
  timer = setInterval(backupNow, 30 * 60 * 1000);
  timer.unref?.();
  setTimeout(backupNow, 60 * 1000).unref?.(); // first snapshot shortly after boot
  logger.info('[authbackup] encrypted session backup on (every 30 min)');
}
