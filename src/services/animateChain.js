import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {animatePhoto, WAN_MAX_SECONDS} from './hfMedia.js';

const run = promisify(execFile);

/** "10s" / "10sec" at the start of the args -> seconds. Returns {seconds, rest}. */
export function parseAnimateArgs(args, {def = 60, max = Number(process.env.ANIMATE_MAX_SECONDS) || 60} = {}) {
  const a = [...args];
  let seconds = def; let clamped = false;
  const m = /^(\d{1,3})s(?:ec(?:onds?)?)?$/i.exec(a[0] || '');
  if (m) { a.shift(); seconds = Number(m[1]); if (seconds > max) { seconds = max; clamped = true; } if (seconds < 1) seconds = 1; }
  return {seconds, rest: a.join(' ').trim(), clamped, max};
}

export const segmentsFor = (seconds) => Math.max(1, Math.ceil(seconds / WAN_MAX_SECONDS));

/**
 * Builds a longer clip by chaining image-to-video segments: each segment starts from the last frame of the
 * previous one. Free public Space only; stops early (keeping finished segments) on quota/busy errors.
 * Returns {file, segments, wanted, stoppedBy?}.
 */
export async function animateChain({jpeg, prompt, seconds, dir, ffmpeg = 'ffmpeg', animate = animatePhoto, canRun = () => true, wrap = (fn) => fn(), onProgress = () => {}, onStart = () => {}, onFill = () => {}, fill = process.env.ANIMATE_FILL !== 'off'}) {
  const wanted = segmentsFor(seconds);
  const files = []; let cur = jpeg; let stoppedBy = null;
  for (let i = 0; i < wanted; i++) {
    if (i > 0 && !canRun()) { stoppedBy = 'hourly cap'; break; }
    const dur = wanted === 1 ? seconds : WAN_MAX_SECONDS;
    let vid;
    try { onStart(i + 1, wanted); } catch { /* ui only */ }
    try { vid = await wrap(() => animate(cur, prompt, {duration: dur})); }
    catch (e) { if (i === 0) throw e; stoppedBy = e?.quota ? 'free daily quota' : 'free service busy'; break; }
    const f = path.join(dir, `seg${i}.mp4`); await fs.writeFile(f, vid); files.push(f);
    onProgress(i + 1, wanted);
    if (i < wanted - 1) {
      const lf = path.join(dir, `last${i}.jpg`);
      try { await run(ffmpeg, ['-y', '-sseof', '-0.15', '-i', f, '-frames:v', '1', '-q:v', '2', lf], {timeout: 60000}); cur = await fs.readFile(lf); }
      catch { stoppedBy = 'frame extract failed'; break; }
    }
  }
  let fillSeconds = 0; const aiSeconds = Math.min(seconds, files.length * (wanted === 1 ? seconds : WAN_MAX_SECONDS));
  if (fill && files.length < wanted && files.length > 0 && /quota|busy|cap/.test(stoppedBy || '')) {
    // Honest fallback: the free AI quota ran out, so the remaining seconds are a smooth camera move (slow zoom) on the last frame, not AI motion.
    try {
      onFill(files.length, wanted);
      const info = await run(ffmpeg, ['-i', files[0]], {timeout: 30000}).then((r) => r.stderr || '', (e) => e.stderr || '');
      const m = /Video:.*?(\d{3,4})x(\d{3,4}).*?([\d.]+) fps/.exec(info) || [];
      const w = Number(m[1]) || 832, h = Number(m[2]) || 480, fps = Math.round(Number(m[3])) || 16;
      const rest = Math.max(1, Math.round(seconds - aiSeconds));
      const still = path.join(dir, 'fillframe.jpg'); await fs.writeFile(still, cur);
      const ff = path.join(dir, 'fill.mp4');
      await run(ffmpeg, ['-y', '-loop', '1', '-framerate', String(fps), '-i', still, '-vf', `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='min(1+0.0008*on,1.4)':x='iw/2-(iw/zoom/2)+sin(on/90)*20':y='ih/2-(ih/zoom/2)':d=${rest * fps}:s=${w}x${h}:fps=${fps},format=yuv420p`, '-frames:v', String(rest * fps), '-an', '-c:v', 'libx264', '-crf', '27', '-preset', 'veryfast', ff], {timeout: 240000});
      files.push(ff); fillSeconds = rest;
    } catch { fillSeconds = 0; }
  }
  if (files.length === 1) return {file: files[0], segments: 1, wanted, stoppedBy, aiSeconds, fillSeconds};
  const list = path.join(dir, 'list.txt'); await fs.writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const out = path.join(dir, 'chain.mp4');
  await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-t', String(seconds), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'veryfast', '-movflags', '+faststart', out], {timeout: 240000});
  return {file: out, segments: files.length - (fillSeconds ? 1 : 0), wanted, stoppedBy, aiSeconds, fillSeconds};
}
