// MENUVID: owner-set image or video that leads the /menu reply.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = (ext) => path.join(config.paths.data, 'menu-media' + ext);
const metaFile = () => path.join(config.paths.data, 'menu-media.json');
export const MAX_BYTES = 8 * 1048576;

export function saveMenuMedia(kind, buf) { // kind: 'image' | 'video'
  const ext = kind === 'image' ? '.jpg' : '.mp4';
  clearMenuMedia();
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(file(ext), buf);
  fs.writeFileSync(metaFile(), JSON.stringify({ kind, ext, at: Date.now() }));
  return true;
}
export function getMenuMedia() {
  try {
    const m = JSON.parse(fs.readFileSync(metaFile(), 'utf8'));
    const p = file(m.ext);
    if (!fs.existsSync(p)) return null;
    return { kind: m.kind, buf: fs.readFileSync(p) };
  } catch { return null; }
}
export function clearMenuMedia() {
  for (const e of ['.jpg', '.mp4']) { try { fs.rmSync(file(e), { force: true }); } catch {} }
  try { fs.rmSync(metaFile(), { force: true }); } catch {}
}
export const menuMediaInfo = () => { try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch { return null; } };
