import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import {registry} from '../handlers/commandHandler.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {checkFfmpegHls} from '../ops/ffmpegCheck.js';

// Live tier of the self-test. Runs every command's own handler against a CAPTURING mock context: nothing is sent to anyone,
// DM only, owner only. Risky or quota-spending commands are skipped with a printed reason.
const DANGEROUS = /^(power|update|restart|shutdown|reboot|reset|wipe|delete|del|clear|purge|ban|unban|kick|promote|demote|leave|block|unblock|broadcast|bc|setprefix|settings|set[a-z]+|backup|restore|import|export|save|pair|logout|eval|exec|shell|sudo|addsudo|delsudo|apikey|password|mute|unmute|lock|unlock|antilink|stress|selftest|livetest|fix|repair|install|uninstall|enable|disable|switch|on|off|remove|add)$/;
const QUOTA = /^(AI|Voice|Image AI)$/i;
const DL_CAT = /^(Downloaders|Download)$/i;
const DL_NAMES = /^(play|video|song|ytmp3|ytmp4|igvideo|tiktok|fb|facebook|instagram|twitter|spotify|pinterest|mediafire|apk)/i;
const MEDIA_IN = /^(filetype|zip|unzip)$/;
const STATE_DEP = /^(earn|syscache)$/;
// Safe, small inputs for commands whose own declared test input is not usable for a live run.
export const INPUTS = {choose: 'tea | coffee', colorinfo: 'ff8800', countdown: '2030-01-01T00:00 Asia/Kolkata', countryinfo: 'India', dnslookup: 'example.com', domaininfo: 'example.com', html: 'https://example.com', ipinfo: '8.8.8.8', linkpreview: 'https://example.com', mealdb: 'pasta', pay: '', pokemon: 'pikachu', publicholidays: 'IN', pypiinfo: 'requests', timeat: 'Asia/Kolkata', play: 'Kevin MacLeod Sneaky Snitch', video: 'Big Buck Bunny trailer', song: 'Kevin MacLeod Sneaky Snitch', ytmp3: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', ytmp4: 'https://www.youtube.com/watch?v=jNQXAC9IVRw'};
const QUOTA_NAMES = /^(ask|ai|gpt|gemini|animate|aivideo|play|video|song|ytmp3|ytmp4|imagine|draw|translate|tts|speak|edit|enhance|upscale|removebg|igvideo|tiktok|fb|facebook|instagram|twitter|spotify|pinterest|mediafire|apk)/i;
const ERR_RE = /Reference: [a-f0-9]{10}|^Could not run|Command stopped|did not answer|not available right now|service is unavailable|\bundefined\b|\[object Object\]|TypeError|ReferenceError/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timed out after ' + ms / 1000 + 's'), {code: 'TIMEOUT'})), ms); })]).finally(() => clearTimeout(t)); };

export function skipReason(cmd) {
  if (cmd.ownerOnly) return 'owner/system command (not run live)';
  if (cmd.group || /group/i.test(cmd.category || '')) return 'needs a group';
  if (cmd.image) return 'needs a photo';
  if (MEDIA_IN.test(cmd.name)) return 'needs a file or media sent to the bot';
  if (STATE_DEP.test(cmd.name)) return 'changes balance/state or is a joke command (not a useful live check)';
  if (cmd.name === 'pay') return 'moves money between users (not run live)';
  if (DANGEROUS.test(cmd.name)) return 'changes settings/data or is destructive';
  if (DL_CAT.test(cmd.category || '') || DL_NAMES.test(cmd.name)) return null;
  if (QUOTA.test(cmd.category || '') || QUOTA_NAMES.test(cmd.name)) return 'uses free-quota AI/download service';
  return null;
}
export function inputFor(cmd) {
  if (Object.hasOwn(INPUTS, cmd.name)) return INPUTS[cmd.name].split(/\s+/).filter(Boolean);
  const t = Array.isArray(cmd.tests) ? cmd.tests[0] : null;
  const raw = Array.isArray(t) ? String(t[0] ?? '') : '';
  const args = raw.split(/\s+/).filter(Boolean);
  if (!args.length && (cmd.minArgs || 0) > 0) return Array.from({length: cmd.minArgs}, () => 'test');
  return args;
}
function mockCtx(base, args, texts) {
  const cap = async (...a) => { for (const x of a) { const c = x?.text ?? x?.caption ?? (typeof x === 'string' ? x : ''); if (c) texts.push(String(c)); } return {key: {id: 'STRESS'}};
  };
  const sock = new Proxy({}, {get: (_t, k) => (k === 'sendMessage' ? async (_j, c) => cap(c) : k === 'user' ? base.sock?.user : k === 'groupMetadata' ? async () => ({id: 'x', subject: 'test', participants: []}) : k === 'profilePictureUrl' ? async () => { throw new Error('item-not-found'); } : k === 'onWhatsApp' ? async () => [] : async () => ({}))});
  return {...base, sock, args, reply: cap, send: cap, sendText: cap};
}
export async function runOne(cmd, base, {timeoutMs = 10000} = {}) {
  const skip = skipReason(cmd); if (skip) return {name: cmd.name, status: 'skip', reason: skip};
  const texts = []; const args = inputFor(cmd);
  try { await withTimeout(Promise.resolve(cmd.run(mockCtx(base, args, texts))), timeoutMs); }
  catch (e) { return {name: cmd.name, status: 'fail', reason: String(e?.message || e).replace(/\s+/g, ' ').slice(0, 120)}; }
  const bad = texts.find((t) => ERR_RE.test(t));
  if (bad) return {name: cmd.name, status: 'fail', reason: 'replied with an error: ' + bad.replace(/\s+/g, ' ').slice(0, 110)};
  return {name: cmd.name, status: 'pass', reason: texts.length ? '' : 'ran, no text reply'};
}
export const isDownload = (c) => DL_CAT.test(c.category || '') || DL_NAMES.test(c.name);
export async function freeMb(dir = process.cwd()) { try { const st = await fs.statfs(dir); return Math.floor((st.bavail * st.bsize) / 1048576); } catch { return Infinity; } }
export async function runAll(list, base, {onProgress = () => {}, timeoutMs = 10000, conc = 3, pause = 150, minFreeMb = 400, dlPause = 2500, dlTimeoutMs = 120000} = {}) {
  const out = []; const total = list.length; let i = 0;
  const fast = list.filter((c) => !isDownload(c)), dls = list.filter(isDownload);
  const t = (c) => (c.name === 'apod' ? 30000 : timeoutMs);
  await Promise.all(Array.from({length: conc}, async () => {
    while (i < fast.length) { const c = fast[i++]; out.push(await runOne(c, base, {timeoutMs: t(c)})); onProgress(out.length, total, out); await sleep(pause); }
  }));
  // Downloads run one at a time, paced, with a free-disk guard that stops the rest safely.
  let stop = false;
  for (const c of dls) {
    if (!stop && (await freeMb()) < minFreeMb) stop = true;
    if (stop) out.push({name: c.name, status: 'skip', reason: 'stopped safely: low free disk space'});
    else { out.push(await runOne(c, base, {timeoutMs: dlTimeoutMs})); await sleep(dlPause); }
    onProgress(out.length, total, out);
  }
  return out;
}
export function progressText(done, total, startedAt, now = Date.now()) {
  const pct = total ? Math.floor((done / total) * 100) : 0; const filled = Math.round(pct / 5);
  const el = Math.max(0, (now - startedAt) / 1000); const rate = done ? el / done : 0; const eta = done ? Math.round(rate * (total - done)) : null;
  const fmt = (s) => (s == null ? '--' : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);
  return `🧪 *Stress test*\n[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${pct}%\n✅ Tested: ${done} / ${total}\n⏳ Remaining: ${total - done}\n⏱️ Elapsed: ${fmt(Math.round(el))}  |  ETA: ${fmt(eta)}`;
}
export const chunkLines = (lines, max = 3200) => { const parts = []; let cur = ''; for (const l of lines) { if ((cur + l).length > max) { parts.push(cur); cur = ''; } cur += l + '\n'; } if (cur) parts.push(cur); return parts; };

let running = false;
export default {
  name: 'stress', aliases: ['selftest', 'livetest'], category: 'Owner', ownerOnly: true,
  description: 'Live-test every command in your DM and list working vs failing commands with reasons',
  usage: 'stress',
  async run(ctx) {
    if (String(ctx.jid).endsWith('@g.us')) return ctx.reply('Run this in a private chat with the bot, not in a group.');
    if (running) return ctx.reply('A stress test is already running.');
    running = true; let dir;
    try {
      const list = registry.list().filter((c) => c.name !== 'stress');
      await ctx.reply(`🧪 Stress test started: ${list.length} commands. Nothing is sent to anyone else; AI/destructive commands are skipped; downloads run one by one with a disk-space guard. One live progress message below updates in place.`);
      const base = {...ctx}; const t0 = Date.now(); let last = 0, key = null, busy = false;
      const first = await ctx.sock.sendMessage(ctx.jid, {text: progressText(0, list.length, t0)}, {quoted: ctx.msg}).catch(() => null); key = first?.key || null;
      const res = await runAll(list, base, {onProgress: (d, n) => {
        const now = Date.now(); if (!key || busy || (now - last < 8000 && d < n)) return; if (d % 25 !== 0 && now - last < 15000 && d < n) return;
        busy = true; last = now; ctx.sock.sendMessage(ctx.jid, {text: progressText(d, n, t0, now), edit: key}).catch(() => {}).finally(() => { busy = false; });
      }});
      if (key) await ctx.sock.sendMessage(ctx.jid, {text: progressText(list.length, list.length, t0), edit: key}).catch(() => {});
      const pass = res.filter((r) => r.status === 'pass'), fail = res.filter((r) => r.status === 'fail'), skip = res.filter((r) => r.status === 'skip');
      const failLines = fail.sort((a, b) => a.name.localeCompare(b.name)).map((r) => `❌ /${r.name} - ${r.reason}`);
      const fx = await checkFfmpegHls().catch(() => null);
      await ctx.reply(`🧪 Done.\n✅ Working: ${pass.length}\n❌ Failed: ${fail.length}\n⏭️ Skipped: ${skip.length} (owner/destructive/AI-quota/needs group, photo or file)\n🎬 ffmpeg HLS: ${fx ? (fx.ok ? 'ok - ' + fx.detail : 'FAILED - ' + fx.detail) : 'check error'}`);
      for (const p of chunkLines(failLines).slice(0, 3)) await ctx.reply(p);
      dir = await createJobDir();
      const txt = [`Tab stress test ${new Date().toISOString()}`, `working ${pass.length} failed ${fail.length} skipped ${skip.length}`, '', ...res.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)).map((r) => `${r.status.toUpperCase()}\t/${r.name}\t${r.reason}`)].join('\n');
      const f = path.join(dir, 'stress-report.txt'); await fs.writeFile(f, txt);
      await ctx.sock.sendMessage(ctx.jid, {document: await fs.readFile(f), mimetype: 'text/plain', fileName: 'stress-report.txt', caption: 'Full per-command report'}, {quoted: ctx.msg});
    } finally { running = false; await removeJobDir(dir); }
  },
};
