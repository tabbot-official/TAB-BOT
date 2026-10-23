import {downloadMediaMessage} from '@whiskeysockets/baileys';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {editPhoto, editLimiter} from '../services/hfMedia.js';

const stamps = new Map();
export default {
  name: 'editimg', aliases: ['aiedit', 'photoedit'], category: 'Image',
  description: 'Edit a photo with a text instruction (free AI)',
  usage: 'editimg <what to change> (send or reply to a photo)',
  minArgs: 1,
  async run(ctx) {
    const prompt = ctx.args.join(' ').trim().slice(0, 300);
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image' || media.animated) return ctx.reply('Send or reply to a photo with ' + config.prefix + 'editimg <what to change>\nExample: ' + config.prefix + 'editimg make the sky look like sunset');
    if (prompt.length < 3) return ctx.reply('Tell me what to change, e.g. ' + config.prefix + 'editimg add a red hat');
    if (Number(media.node.fileLength) > 10 * 1048576) return ctx.reply('Photo is too big (max 10MB).');
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 600000);
    if (mine.length >= 3) return ctx.reply('Limit: 3 edits per 10 minutes. Try again shortly.');
    if (!editLimiter.ok()) return ctx.reply('Photo editing is busy or turned off right now. Try again in a few minutes.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    await ctx.reply('🎨 Editing your photo... this can take up to a minute.');
    let dir;
    try {
      await downloadQueue.add(ctx.sender, async () => {
        dir = await createJobDir();
        const input = path.join(dir, 'input');
        await saveImageStream(await downloadMediaMessage(media.message, 'stream', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage}), input);
        const {data, info} = await sharp(input, {limitInputPixels: 16e6, failOn: 'error'}).rotate().resize(1024, 1024, {fit: 'inside', withoutEnlargement: true}).flatten({background: '#fff'}).jpeg({quality: 90}).toBuffer({resolveWithObject: true});
        let out;
        try { out = await editLimiter.run(() => editPhoto(data, prompt, {width: info.width, height: info.height})); }
        catch (e) {
          logger.warn('editimg failed: ' + (e?.message || 'error'));
          if (e?.quota) return ctx.reply('The free AI daily limit for photo editing is used up. Try again later (it resets daily).');
          return ctx.reply('Could not edit the photo (the free AI service is busy). Try again in a few minutes.');
        }
        const jpg = await sharp(out, {limitInputPixels: 4096 * 4096}).jpeg({quality: 92}).toBuffer();
        await ctx.sock.sendMessage(ctx.jid, {image: jpg, caption: '🎨 ' + prompt.slice(0, 150) + '\n_Edited by a free public AI service (Qwen Image Edit). Your photo was sent to it._'}, {quoted: ctx.msg});
      });
    } catch (e) { logger.warn('editimg error: ' + (e?.message || 'error')); await ctx.reply('Photo editing failed.'); }
    finally { await removeJobDir(dir); }
  },
};
