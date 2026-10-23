import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { findMedia, downloadMedia, toSticker, MEDIA_LIMIT } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

export function parseStickerArgs(args) {
  let crop = false; const rest = [];
  for (const a of args || []) { if (/^(--)?(crop|cover|fill)$/i.test(a)) crop = true; else rest.push(a); }
  const [p, a] = rest.join(' ').split('|').map((x) => x.trim().replace(/[\u0000-\u001F]/g, '').slice(0, 30));
  return { crop, pack: p || 'Tab', author: a || (p ? '' : 'Rohan') };
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  category: 'Image',
  description: 'Make a sticker from an image or short video',
  usage: 'sticker [crop] [pack name | author]  (send or reply to an image or short video)',
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'sticker (send or reply to image)'}));
    if (Number(media.node.fileLength || 0) > MEDIA_LIMIT) return ctx.reply(t(ctx,'error_input')+' (15 MB)');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const {pack, author, crop} = parseStickerArgs(ctx.args);
      const out = await toSticker(buf, { animated: media.animated, pack, author, crop });
      await ctx.sock.sendMessage(ctx.jid, { sticker: out }, { quoted: ctx.msg });
      logger.info(`[image] sticker ok ${Math.round(out.length / 1024)} KB`);
    } catch (err) {
      await replyFailure(ctx,'sticker',err);
    }
  },
};
