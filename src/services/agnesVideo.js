import axios from 'axios';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const API = 'https://apihub.agnes-ai.com';
const NET = {proxy: false, maxRedirects: 0};
export class VideoError extends Error {constructor(m, code) {super(m); this.code = code;}}

export function sizeFor(res) {
  return res === '720p' ? {width: 1280, height: 720} : res === '480p' ? {width: 848, height: 480} : {width: 1920, height: 1080};
}
export function parseVideoArgs(args) {
  let res = '1080p'; const words = [];
  for (const a of args) { const m = /^--?(480|720|1080)p?$/i.exec(a); if (m) res = m[1] + 'p'; else words.push(a); }
  return {res, prompt: words.join(' ').trim()};
}
export function checkUrl(u) {
  let x; try { x = new URL(u); } catch { throw new VideoError('bad url'); }
  if (x.protocol !== 'https:' || !/(^|\.)agnes-ai\.(cn|com)$/.test(x.hostname)) throw new VideoError('unexpected video host');
  return x.toString();
}
export async function createTask(prompt, res, key) {
  const {width, height} = sizeFor(res);
  const r = await axios.post(API + '/v1/videos', {model: 'agnes-video-v2.0', prompt, width, height, num_frames: 97, frame_rate: 24},
    {headers: {Authorization: 'Bearer ' + key}, timeout: 30000, ...NET, validateStatus: () => true});
  if (r.status === 429) throw new VideoError('rate limited', 'busy');
  if (r.status === 401 || r.status === 403) throw new VideoError('auth', 'auth');
  if (r.status === 402) throw new VideoError('no balance', 'quota');
  if (r.status >= 300 || !r.data?.task_id) throw new VideoError('create failed ' + r.status + ' ' + String(r.data?.error?.message || '').slice(0, 80), r.status >= 500 ? 'busy' : 'create');
  return r.data.task_id;
}
export async function waitTask(id, key, {timeoutMs = 240000, everyMs = 5000, sleep = (ms) => new Promise((s) => setTimeout(s, ms))} = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await sleep(everyMs);
    const r = await axios.get(API + '/v1/videos/' + encodeURIComponent(id), {headers: {Authorization: 'Bearer ' + key}, timeout: 20000, ...NET, validateStatus: () => true});
    if (r.status >= 500) continue;
    const s = r.data?.status;
    if (s === 'completed' && r.data.url) return checkUrl(r.data.url);
    if (s === 'failed') throw new VideoError('generation failed');
  }
  throw new VideoError('timeout', 'timeout');
}
export async function download(url, dest, maxBytes = 60 * 1048576) {
  const r = await axios.get(checkUrl(url), {responseType: 'arraybuffer', timeout: 60000, maxContentLength: maxBytes, ...NET});
  await fs.writeFile(dest, Buffer.from(r.data));
  return dest;
}
function run(bin, args, ms = 120000) {
  return new Promise((resolve, reject) => {
    let out = ''; const p = spawn(bin, args, {stdio: ['ignore', 'pipe', 'ignore']});
    p.stdout.on('data', (d) => { out += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('error', reject);
    p.on('close', (c) => { clearTimeout(t); c === 0 ? resolve(out) : reject(new Error(bin + ' ' + c)); });
  });
}
export function isWhatsAppSafe(info) {
  const v = info.streams?.find((s) => s.codec_type === 'video');
  if (!v) return false;
  return v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && /^(Baseline|Constrained Baseline|Main|High)$/.test(v.profile || 'High') && (v.width % 2 === 0) && (v.height % 2 === 0);
}
export async function probe(file, ffprobe = 'ffprobe') {
  return JSON.parse(await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', file], 30000));
}
// Ensures H.264 yuv420p + AAC mp4 (silent audio track added if missing) so WhatsApp plays it everywhere.
export async function ensureWhatsApp(file, {ffmpeg = 'ffmpeg', ffprobe = 'ffprobe'} = {}) {
  const info = await probe(file, ffprobe);
  const hasAudio = info.streams.some((s) => s.codec_type === 'audio');
  const audioOk = !hasAudio || info.streams.find((s) => s.codec_type === 'audio').codec_name === 'aac';
  if (isWhatsAppSafe(info) && audioOk) return {file, converted: false};
  const out = file.replace(/\.mp4$/, '') + '.wa.mp4';
  await run(ffmpeg, ['-nostdin', '-y', '-i', file, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], 180000);
  return {file: out, converted: true};
}
export async function tmpDir() { return fs.mkdtemp(path.join(os.tmpdir(), 'jv-video-')); }
