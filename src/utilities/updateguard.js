// Post-update watchdog: verifies the bot is healthy after a package install/update
// restart, and rolls package.json + package-lock.json back when it is not.
// Two failure shapes:
//  - boot crash loop: we restarted for an update but never reached WhatsApp connect
//    (pending file survives, boot counter grows) -> restore backup at boot.
//  - booted but broken: commands failed to load after the update -> restore + npm ci + one more restart.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import logger from '../utils/logger.js';

const PENDING = path.join('data', 'pending-update.json');
const ROLLED_BACK = path.join('data', 'update-rolled-back.json');

export function markPending(info) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(PENDING, JSON.stringify({ ...info, boots: 0, ts: Date.now() })); } catch (e) { logger.warn('[updateguard] markPending: ' + (e?.message || 'error')); }
}

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

function restoreBackup(backupDir) {
  try {
    fs.copyFileSync(path.join(backupDir, 'package.json'), 'package.json');
    fs.copyFileSync(path.join(backupDir, 'package-lock.json'), 'package-lock.json');
    execSync('npm ci --no-audit --no-fund', { stdio: 'ignore', timeout: 300000 });
    return true;
  } catch (e) { logger.error('[updateguard] rollback failed: ' + (e?.message || 'error')); return false; }
}

// Called early in boot, before connecting. If the last two boots never reached
// connect after an update, restore the pre-update package files and continue clean.
export async function onBootStart() {
  const p = readJson(PENDING);
  if (!p) return;
  p.boots = (p.boots || 0) + 1;
  if (p.boots <= 2) { try { fs.writeFileSync(PENDING, JSON.stringify(p)); } catch {} return; }
  logger.error('[updateguard] update "' + (p.desc || '?') + '" never reached connect after ' + (p.boots - 1) + ' boots - rolling back packages');
  const ok = p.backupDir && restoreBackup(p.backupDir);
  try { fs.unlinkSync(PENDING); } catch {}
  try { fs.writeFileSync(ROLLED_BACK, JSON.stringify({ desc: p.desc, ok, ts: Date.now() })); } catch {}
  if (!ok) logger.error('[updateguard] automatic rollback FAILED - manual restore needed from ' + p.backupDir);
}

// Called when WhatsApp connects. Verifies health; on breakage restores + restarts once.
// Returns a short owner-facing verdict string, or null when no update is pending.
export async function onConnected({ registry, commandLoadFailures }) {
  const done = readJson(ROLLED_BACK);
  if (done) { try { fs.unlinkSync(ROLLED_BACK); } catch {} ; return '🛠️ The package update "' + done.desc + '" crashed on boot and was rolled back automatically. Everything is back on the old versions.'; }
  const p = readJson(PENDING);
  if (!p) return null;
  const cmds = registry?.list?.().length || 0;
  const broken = (commandLoadFailures?.length || 0) > 3 || cmds < 1900;
  if (broken) {
    logger.error('[updateguard] post-update self-test FAILED (commands=' + cmds + ', loadFailures=' + (commandLoadFailures?.length || 0) + ') - rolling back');
    const ok = p.backupDir && restoreBackup(p.backupDir);
    try { fs.unlinkSync(PENDING); } catch {}
    try { fs.writeFileSync(ROLLED_BACK, JSON.stringify({ desc: p.desc, ok, ts: Date.now() })); } catch {}
    if (ok) setTimeout(() => process.exit(0), 4000); // panel restarts us onto the restored packages
    return null;
  }
  try { fs.unlinkSync(PENDING); } catch {}
  return '✅ Update verified: ' + p.desc + '. ' + cmds + ' commands loaded, connection healthy.';
}
