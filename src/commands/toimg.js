import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { findMedia, downloadMedia, stickerToImage } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'unsticker'],
  category: 'Image',
  description: 'Turn a sticker into an image',
  usage: 'toimg (reply to a sticker)',
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'sticker') return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'toimg (reply to sticker)'}));
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const out = await stickerToImage(buf, 'png');
      await ctx.sock.sendMessage(ctx.jid, { image: out, caption:'✅' }, { quoted: ctx.msg });
      logger.info('[image] toimg ok');
    } catch (err) {
      await replyFailure(ctx,'toimg',err);
    }
  },
};
