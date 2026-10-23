import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { findMedia, downloadMedia, convertImage } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

const FORMATS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

export default {
  name: 'convert',
  aliases: ['toformat'],
  category: 'Image',
  description: 'Convert an image to png, jpg or webp',
  usage: 'convert png (png, jpg or webp)',
  minArgs: 1,
  async run(ctx) {
    const input=String(ctx.args[0]).toLowerCase().replace(/^\./,'');
    const fmt=Object.hasOwn(FORMATS,input)?FORMATS[input]:null;
    if (!fmt) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'convert png|jpg|webp (image)'}));
    const media = findMedia(ctx.msg);
    if (!media || !['image', 'sticker'].includes(media.type)) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'convert png|jpg|webp (image)'}));
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const { out, mime, ext } = await convertImage(buf, fmt);
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: mime, fileName: `converted.${ext}`, caption: `✅ ${ext.toUpperCase()}` }, { quoted: ctx.msg });
      logger.info('[image] convert ok');
    } catch (err) {
      await replyFailure(ctx,'convert',err);
    }
  },
};
