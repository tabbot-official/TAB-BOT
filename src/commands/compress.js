import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { findMedia, downloadMedia, compressImage } from '../utils/imageTools.js';
import { formatBytes } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
  name: 'compress',
  aliases: ['shrink'],
  category: 'Image',
  description: 'Make an image smaller in file size',
  usage: 'compress 60 (quality 10-95, optional)',
  async run(ctx) {
    const q = ctx.args[0] ? Math.round(Number(ctx.args[0])) : 60;
    if (!Number.isFinite(q) || q < 10 || q > 95) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'compress 10-95 (image)'}));
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image') return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'compress 10-95 (image)'}));
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const out = await compressImage(buf, q);
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: 'image/jpeg', fileName: 'compressed.jpg', caption: `✅ ${formatBytes(buf.length)} → ${formatBytes(out.length)} (${q})` }, { quoted: ctx.msg });
      logger.info('[image] compress ok');
    } catch (err) {
      await replyFailure(ctx,'compress',err);
    }
  },
};
