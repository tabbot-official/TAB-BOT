// Downloads the standalone yt-dlp binary into ./bin (no Python needed). Never fails npm install.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin');
const asset = {
  'linux-x64': 'yt-dlp_linux',
  'linux-arm64': 'yt-dlp_linux_aarch64',
  'darwin-x64': 'yt-dlp_macos',
  'darwin-arm64': 'yt-dlp_macos',
  'win32-x64': 'yt-dlp.exe',
}[`${process.platform}-${process.arch}`];
const target = path.join(bin, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

try {
  if (fs.existsSync(target) || process.env.YTDLP_PATH) process.exit(0);
  if (!asset) {
    if (process.platform === 'android') console.warn('[setup] Termux: install yt-dlp with "pip install yt-dlp" (Tab finds it on PATH automatically).');
    else console.warn('[setup] No yt-dlp binary for this platform. Install yt-dlp yourself and set YTDLP_PATH.');
    process.exit(0);
  }
  fs.mkdirSync(bin, { recursive: true });
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(target, 0o755);
  console.log('[setup] yt-dlp installed to bin/');
} catch (err) {
  console.warn(`[setup] Could not install yt-dlp automatically (${err.message}). Run "npm run setup:ytdlp" later or set YTDLP_PATH.`);
}
