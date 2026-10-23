// EMOJIMIX: combine two emojis into one sticker (emoji kitchen style).
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { toSticker } from '../utils/imageTools.js';

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export default {
  name: 'emojimix', aliases: ['mixemoji'], category: 'Fun',
  description: 'Mix two emojis into one sticker',
  usage: 'emojimix 😀 😍',
  async run(ctx) {
    if (!featOn('emojimix')) return ctx.reply('Emoji mix is turned off right now.');
    const found = ctx.args.join('').match(EMOJI_RE) || [];
    if (found.length < 2) return ctx.reply('Give me two emojis. Example: ' + config.prefix + 'emojimix 😀 😍');
    const [a, b] = found;
    try {
      const r = await fetch(`https://emojik.vercel.app/s/${encodeURIComponent(a)}_${encodeURIComponent(b)}?size=256`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return ctx.reply('⚠️ That pair has no mashup. Try two different emojis.');
      const buf = Buffer.from(await r.arrayBuffer());
      const webp = await toSticker(buf, { animated: false });
      await ctx.sock.sendMessage(ctx.jid, { sticker: webp }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[emojimix] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not mix those right now.');
    }
  },
};
