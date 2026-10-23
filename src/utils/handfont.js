// Installs the bundled handwriting font (Kalam, OFL-licensed) into fontconfig's
// user dir so sharp/librsvg can render it. Best-effort: if the box has no
// fontconfig, /handwrite still renders in the default font.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';

let done = false;
export function ensureHandFont() {
  if (done) return true;
  try {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts/Kalam-Regular.ttf');
    const dir = path.join(os.homedir(), '.fonts');
    const dest = path.join(dir, 'Kalam-Regular.ttf');
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, dest);
      execFile('fc-cache', ['-f', dir], () => {});
    }
    done = true;
    return true;
  } catch (e) { logger.warn('[handwrite] font install failed: ' + (e?.message || 'error')); return false; }
}
