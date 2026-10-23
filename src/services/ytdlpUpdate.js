import {spawn} from 'node:child_process';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Keeps the standalone yt-dlp binary in ./bin current. Most YouTube/Instagram download failures come from an outdated yt-dlp.
// Uses yt-dlp's own built-in updater (official GitHub releases). Never throws, never blocks startup, and only touches ./bin (or YTDLP_PATH inside this project).
const run = (bin, args, timeoutMs) => new Promise((resolve) => {
  let out = ''; let done = false;
  const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
  let child; try { child = spawn(bin, args, {stdio: ['ignore', 'pipe', 'pipe']}); } catch (e) { return resolve({code: -1, out: String(e.message)}); }
  const t = setTimeout(() => { child.kill('SIGKILL'); finish({code: -2, out: out + ' (timeout)'}); }, timeoutMs);
  child.stdout.on('data', (d) => { if (out.length < 5000) out += d; }); child.stderr.on('data', (d) => { if (out.length < 5000) out += d; });
  child.on('error', (e) => finish({code: -1, out: String(e.message)})); child.on('close', (code) => finish({code, out}));
});
export async function updateYtDlp({bin = config.tools.ytdlp, runner = run, log = logger} = {}) {
  try {
    const resolved = path.resolve(bin || '');
    const projectBin = path.join(config.root, 'bin') + path.sep;
    if (!resolved.startsWith(projectBin)) { log.info('[ytdlp-update] skipped: yt-dlp is not the project binary'); return {skipped: true}; }
    const before = (await runner(bin, ['--version'], 20000)).out.trim().split('\n')[0];
    const r = await runner(bin, ['-U'], 90000);
    const after = (await runner(bin, ['--version'], 20000)).out.trim().split('\n')[0];
    log.info(`[ytdlp-update] ${before || '?'} -> ${after || '?'}${r.code === 0 ? '' : ` (update exit ${r.code}: ${r.out.replace(/\s+/g, ' ').slice(0, 120)})`}`);
    return {before, after, ok: r.code === 0};
  } catch (e) { log.warn('[ytdlp-update] failed: ' + String(e.message).slice(0, 100)); return {ok: false}; }
}
export function startYtDlpUpdater({firstDelayMs = 90_000, everyMs = 12 * 3600_000} = {}) {
  setTimeout(() => { updateYtDlp(); setInterval(() => updateYtDlp(), everyMs).unref(); }, firstDelayMs).unref();
}
