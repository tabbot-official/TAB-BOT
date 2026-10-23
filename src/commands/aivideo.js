import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {makeLimiter} from '../services/publicAi.js';
import {textToVideoLtx} from '../services/hfMedia.js';
import {findMedia} from '../utils/imageTools.js';
import {parseVideoArgs, createTask, waitTask, download, ensureWhatsApp, tmpDir, VideoError} from '../services/agnesVideo.js';

const limiter = makeLimiter('VIDEO', 'VIDEO_PER_HOUR', 20, 2);
const stamps = new Map();
export default {
  name: 'aivideo', aliases: ['t2v', 'genvideo', 'text2video'], category: 'AI',
  description: 'Text to video (free AI, takes 1-3 minutes)',
  usage: 'aivideo <describe the scene> [--720]',
  minArgs: 1,
  async run(ctx) {
    const photo = findMedia(ctx.msg);
    if (photo && photo.type === 'image') return ctx.reply('/aivideo makes a video from text only and ignores photos.\nTo animate a photo, reply to it with ' + config.prefix + 'animate [motion idea], for example ' + config.prefix + 'animate laughing');
    const key = process.env.AGNES_API_KEY;
    if (!key || process.env.VIDEO_ENABLED === 'false') return ctx.reply('Video generation is switched off right now.');
    const {res, prompt} = parseVideoArgs(ctx.args);
    if (prompt.length < 5) return ctx.reply('Usage: ' + config.prefix + 'aivideo <describe the scene>\nExample: ' + config.prefix + 'aivideo a cat walking on a beach at sunset');
    if (prompt.length > 400) return ctx.reply('Prompt too long (max 400 characters).');
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 600000);
    if (mine.length >= 2) return ctx.reply('Limit: 2 videos per 10 minutes. Try again shortly.');
    if (!limiter.ok()) return ctx.reply('Video generation is busy or at its hourly cap. Try again in a few minutes.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    let live = null;
    try { live = await ctx.reply('🎬 Generating your video (' + res + '). This takes about 1-3 minutes...'); } catch { live = null; }
    const say = async (text) => { if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, {text, edit: live.key}); } catch { /* best effort */ } } };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let dir; let usedFallback = false;
    try {
      const file = await limiter.run(async () => {
        dir = await tmpDir();
        const waits = [30, 45, 60];
        let lastErr;
        for (let i = 0; i <= waits.length; i++) {
          try {
            const id = await createTask(prompt, res, key);
            if (i > 0) await say('🎬 Service is free again - generating your video (' + res + '). This takes about 1-3 minutes...');
            const url = await waitTask(id, key);
            return await download(url, path.join(dir, 'v.mp4'));
          } catch (e) {
            lastErr = e;
            if (e?.code !== 'busy' || i === waits.length) break;
            for (let left = waits[i]; left > 0; left -= 10) { await say(`⏳ The free video service is at its rate limit. Retrying automatically in ${left}s (try ${i + 2}/${waits.length + 1})...`); await sleep(Math.min(10, left) * 1000); }
          }
        }
        // Fallback: free LTX-Video Space (shares the free Hugging Face GPU quota), shorter 704x512 clip.
        if (process.env.VIDEO_FALLBACK !== 'off' && ['busy', 'quota', 'timeout', 'create'].includes(lastErr?.code)) {
          await say('🔁 Main free service is still busy - switching to a backup free AI (shorter 5s clip, lower resolution)...');
          try { const buf = await textToVideoLtx(prompt); const f = path.join(dir, 'v.mp4'); await fs.writeFile(f, buf); usedFallback = true; return f; }
          catch (e2) { logger.warn('video fallback failed: ' + (e2?.message || 'error')); }
        }
        throw lastErr;
      });
      await say('✅ Done - sending your video...');
      const {file: out} = await ensureWhatsApp(file, {ffmpeg: config.tools?.ffmpeg || 'ffmpeg', ffprobe: config.tools?.ffprobe || 'ffprobe'});
      const buf = await fs.readFile(out);
      await ctx.sock.sendMessage(ctx.jid, {video: buf, mimetype: 'video/mp4', caption: '🎬 ' + prompt.slice(0, 120) + '\n' + (usedFallback ? '_Made by a free public AI service (LTX-Video, backup because the main one was busy). Your prompt was sent to it._' : '_Made by a free public AI service (Agnes). Your prompt was sent to it._')}, {quoted: ctx.msg});
    } catch (e) {
      logger.warn('video failed: ' + (e?.message || 'error'));
      if (e?.code === 'timeout') return ctx.reply('The video took too long. The free service is busy - try again in a few minutes.');
      if (e?.code === 'auth' || e?.code === 'quota') return ctx.reply('The free video service refused the request (its free access or credit may have run out). Please tell the bot owner. Nothing was charged.');
      if (e?.code === 'busy') return ctx.reply('The free video services are all at their rate limit right now (I retried and tried a backup). Try again in a few minutes.');
      return ctx.reply('Could not make the video right now. Try again later or with a simpler prompt.');
    } finally { if (dir) await fs.rm(dir, {recursive: true, force: true}).catch(() => {}); }
  },
};
