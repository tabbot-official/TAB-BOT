import {downloadMediaMessage} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {animatePhoto, animateLimiter} from '../services/hfMedia.js';
import {ensureWhatsApp} from '../services/agnesVideo.js';
import {animateChain, parseAnimateArgs, segmentsFor} from '../services/animateChain.js';

const stamps = new Map();
const fmtT = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
/** Live progress text: bar from finished clips plus a time-based estimate for the clip in progress (capped, never claims done early). */
export function renderAnimate({done, total, segStart, durations, stage, seconds}) {
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 100;
  const cur = done < total && stage === 'gen' ? Math.min(0.95, (Date.now() - segStart) / 1000 / avg) : 0;
  const frac = Math.min(1, (done + cur) / total);
  const filled = Math.round(frac * 20);
  const left = stage === 'gen' ? Math.max(0, (total - done - cur) * avg) : stage === 'stitch' ? 15 : 0;
  const head = stage === 'fill' ? '🎥 Free AI quota used up - adding smooth camera-motion for the rest...' : stage === 'stitch' ? '🧵 Stitching clips together...' : stage === 'send' ? '📤 Sending your video...' : '🎞️ Animating your photo';
  return [head, `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${Math.floor(frac * 100)}%`, `🎬 Clips: ${done}/${total} done${stage === 'gen' && done < total ? `, clip ${done + 1} generating` : ''}`, `⏳ Remaining: ${Math.max(0, total - done)} clip${total - done === 1 ? '' : 's'}`, `⏱️ ETA: ~${fmtT(left)}${durations.length ? '' : ' (estimate, refines after clip 1)'}`, `📏 Target: ~${seconds}s video`].join('\n');
}
export default {
  name: 'animate', aliases: ['img2vid', 'photo2video', 'i2v'], category: 'AI',
  description: 'Turn a photo into a short video (free AI, image to video)',
  usage: 'animate [30s] (default 60s) [motion idea] (send or reply to a photo; free AI makes 5s per step, longer clips up to 60s are chained)',
  async run(ctx) {
    if (process.env.ANIMATE_ENABLED === 'false') return ctx.reply('Photo animation is switched off right now.');
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image' || media.animated) return ctx.reply('Send or reply to a photo with ' + config.prefix + 'animate [optional motion idea]\nFor text to video use ' + config.prefix + 'aivideo.');
    if (Number(media.node.fileLength) > 10 * 1048576) return ctx.reply('Photo is too big (max 10MB).');
    const parsed = parseAnimateArgs(ctx.args);
    const prompt = parsed.rest.slice(0, 250);
    const segs = segmentsFor(parsed.seconds);
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 900000);
    if (mine.length >= 2) return ctx.reply('Limit: 2 animations per 15 minutes. Try again shortly.');
    if (!animateLimiter.ok()) return ctx.reply('Photo animation is busy or at its hourly cap. Try again in a few minutes.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    const st = {done: 0, total: segs, segStart: Date.now(), durations: [], stage: 'gen', seconds: parsed.seconds};
    let live = null; let ticker = null; let lastText = '';
    const draw = async () => { if (!live) return; const text = renderAnimate(st); if (text === lastText) return; lastText = text; try { await ctx.sock.sendMessage(ctx.jid, {text, edit: live.key}); } catch { /* best effort */ } };
    if (segs > 1) {
      await ctx.reply(`🎞️ Making a ~${parsed.seconds}s clip from ${segs} chained AI steps (about ${Math.ceil(segs * 1.5)}-${segs * 3} min). If the free daily AI quota runs out I send what is finished.` + (parsed.clamped ? `\nMax is ${parsed.max}s on the free service.` : ''));
      try { live = await ctx.reply(renderAnimate(st)); lastText = renderAnimate(st); } catch { live = null; }
      ticker = setInterval(draw, 10000);
    } else await ctx.reply('🎞️ Animating your photo... this takes 1-3 minutes.');
    let dir;
    try {
      await downloadQueue.add(ctx.sender, async () => {
        dir = await createJobDir();
        const input = path.join(dir, 'input');
        await saveImageStream(await downloadMediaMessage(media.message, 'stream', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage}), input);
        const jpeg = await sharp(input, {limitInputPixels: 16e6, failOn: 'error'}).rotate().resize(832, 832, {fit: 'inside', withoutEnlargement: true}).flatten({background: '#fff'}).jpeg({quality: 90}).toBuffer();
        let res;
        try { res = await animateChain({onFill: () => { st.stage = 'fill'; draw(); }, onStart: () => { st.segStart = Date.now(); st.stage = 'gen'; }, onProgress: (d) => { st.durations.push((Date.now() - st.segStart) / 1000); st.done = d; if (d >= st.total) st.stage = 'stitch'; draw(); }, jpeg, prompt, seconds: parsed.seconds, dir, ffmpeg: config.tools?.ffmpeg || 'ffmpeg', canRun: () => animateLimiter.ok(), wrap: (fn) => animateLimiter.run(fn)}); }
        catch (e) {
          logger.warn('animate failed: ' + (e?.message || 'error'));
          if (e?.quota) return ctx.reply('The free AI daily limit for animation is used up. Try again later (it resets daily).');
          return ctx.reply('Could not animate the photo (the free AI service is busy). Try again in a few minutes.');
        }
        st.stage = 'stitch'; await draw();
        const raw = res.file;
        const {file} = await ensureWhatsApp(raw, {ffmpeg: config.tools?.ffmpeg || 'ffmpeg', ffprobe: config.tools?.ffprobe || 'ffprobe'});
        st.stage = 'send'; st.done = res.segments; await draw();
        await ctx.sock.sendMessage(ctx.jid, {video: await fs.readFile(file), mimetype: 'video/mp4', caption: '🎞️ Animated by a free public AI service (Wan 2.2). Your photo was sent to it.' + (res.fillSeconds ? `\nFirst ${res.aiSeconds}s is AI-animated; the last ${res.fillSeconds}s is a smooth zoom/camera move on the final frame (free AI quota ran out: ${res.stoppedBy}).` : res.segments < res.wanted ? `\nStopped early (${res.stoppedBy}): ${res.segments}/${res.wanted} steps done.` : '')}, {quoted: ctx.msg});
      });
    } catch (e) { logger.warn('animate error: ' + (e?.message || 'error')); await ctx.reply('Photo animation failed.'); }
    finally { if (ticker) clearInterval(ticker); if (live) { st.stage = 'send'; st.done = Math.min(st.done, st.total); const t = st.done >= st.total ? renderAnimate({...st, done: st.total}).replace('📤 Sending your video...', '✅ Done - video sent below') : renderAnimate(st).replace('📤 Sending your video...', '⏹️ Stopped early'); try { await ctx.sock.sendMessage(ctx.jid, {text: t, edit: live.key}); } catch { /* ignore */ } } await removeJobDir(dir); }
  },
};
