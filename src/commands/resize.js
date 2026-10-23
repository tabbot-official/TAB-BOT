import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { findMedia, downloadMedia, resizeImage } from '../utils/imageTools.js';
import { formatBytes } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
  name: 'resize',
  category: 'Image',
  description: 'Resize an image to a width in pixels',
  usage: 'resize 800 (send or reply to an image)',
  minArgs: 1,
  async run(ctx) {
    const width = Math.round(Number(ctx.args[0]));
    if (!Number.isFinite(width) || width < 16 || width > 4096) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'resize 16-4096 (image)'}));
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image') return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'resize 16-4096 (image)'}));
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const { out, meta } = await resizeImage(buf, width);
      const ext = meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpg';
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: `image/${ext === 'jpg' ? 'jpeg' : ext}`, fileName: `resized-${width}.${ext}`, caption: `✅ ${meta.width} px → ${width} px (${formatBytes(out.length)})` }, { quoted: ctx.msg });
      logger.info('[image] resize ok');
    } catch (err) {
      await replyFailure(ctx,'resize',err);
    }
  },
};
