import { spawn } from 'node:child_process';
import config from '../config/config.js';

function grab(args, ms = 10000) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(config.tools.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return resolve(null); }
    let out = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(null); }, ms);
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.stdout.on('data', (d) => { if (out.length < 200000) out += d; });
    child.stderr.on('data', (d) => { if (out.length < 200000) out += d; });
    child.on('close', () => { clearTimeout(timer); resolve(out); });
  });
}

/** Offline ffmpeg capability check: binary runs, speaks https, demuxes HLS (Pinterest/remux path). */
export async function checkFfmpegHls() {
  const ver = await grab(['-hide_banner', '-version']);
  if (!ver || !/ffmpeg version/i.test(ver)) return { ok: false, detail: 'ffmpeg binary missing or not runnable (' + config.tools.ffmpeg + ')' };
  const protos = await grab(['-hide_banner', '-protocols']);
  if (!protos || !/^https$/m.test(protos.trim()) && !/\bhttps\b/.test(protos)) return { ok: false, detail: 'ffmpeg lacks https protocol support' };
  const demux = await grab(['-hide_banner', '-demuxers']);
  if (!demux || !/\bhls\b/.test(demux)) return { ok: false, detail: 'ffmpeg lacks the hls demuxer' };
  return { ok: true, detail: (ver.match(/ffmpeg version \S+/) || ['ffmpeg'])[0] + ', https+hls ready' };
}
