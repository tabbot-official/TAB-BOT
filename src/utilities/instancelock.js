// Single-instance lock: two Tab processes on the same auth dir fight over the
// WhatsApp session and get each other logged out (code 440). This refuses a second start.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = () => path.join(config.paths.data, 'jarvis.pid');
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

export function acquireLock() {
  try {
    fs.mkdirSync(config.paths.data, { recursive: true });
    const prev = Number(fs.readFileSync(file(), 'utf8'));
    if (prev && prev !== process.pid && alive(prev)) return false;
  } catch { /* no stale lock */ }
  try { fs.writeFileSync(file(), String(process.pid)); } catch { /* best effort */ }
  return true;
}
export function releaseLock() {
  try { if (Number(fs.readFileSync(file(), 'utf8')) === process.pid) fs.rmSync(file(), { force: true }); } catch {}
}
process.on('exit', releaseLock);
