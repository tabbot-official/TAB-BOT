// TELESTICKER: import stickers from a Telegram sticker pack (Bot API).
// Needs TELEGRAM_BOT_TOKEN in the env. Static -> image sticker, video -> animated sticker.
// .tgs (Lottie) stickers are skipped - no lightweight renderer on this host.
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { toSticker } from '../utils/imageTools.js';

const api = (token, m) => `https://api.telegram.org/bot${token}/${m}`;

export default {
  name: 'telesticker', aliases: ['tgstick', 'tsticker'], category: 'Media',
  description: 'Import stickers from a Telegram pack',
  usage: 'telesticker <pack link or name> [count]',
  async run(ctx) {
    if (!featOn('telesticker')) return ctx.reply('Telegram sticker import is turned off right now.');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return ctx.reply('Telegram import is not set up yet. Ask my owner to add the bot token.');
    const raw = ctx.args[0] || '';
    const name = raw.replace(/^https?:\/\/t\.me\/addstickers\//, '').replace(/[^\w]/g, '');
    if (!name) return ctx.reply('Send a Telegram pack link or name. Example: ' + config.prefix + 'telesticker https://t.me/addstickers/Animals 5');
    const count = Math.min(Math.max(parseInt(ctx.args[1] || '10', 10) || 10, 1), 30);
    try {
      const r = await fetch(api(token, 'getStickerSet?name=' + encodeURIComponent(name)), { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (!j.ok) return ctx.reply('⚠️ Pack not found: ' + (j.description || 'check the name.'));
      const stickers = j.result.stickers || [];
      if (!stickers.length) return ctx.reply('That pack is empty.');
      await ctx.reply(`⏳ Importing up to ${count} stickers from "${j.result.title}"...`);
      let sent = 0, skipped = 0;
      for (const st of stickers) {
        if (sent >= count) break;
        if (st.is_animated) { skipped++; continue; } // .tgs Lottie - no renderer here
        try {
          const fj = await (await fetch(api(token, 'getFile?file_id=' + st.file_id), { signal: AbortSignal.timeout(15000) })).json();
          if (!fj.ok) { skipped++; continue; }
          const dl = await fetch(`https://api.telegram.org/file/bot${token}/${fj.result.file_path}`, { signal: AbortSignal.timeout(30000) });
          const buf = Buffer.from(await dl.arrayBuffer());
          if (buf.length > 5 * 1024 * 1024) { skipped++; continue; }
          const webp = st.is_video ? await toSticker(buf, { animated: true }) : await toSticker(buf, { animated: false });
          await ctx.sock.sendMessage(ctx.jid, { sticker: webp }, { quoted: sent === 0 ? ctx.msg : undefined });
          sent++;
        } catch (e) { skipped++; logger.warn('[telesticker] item failed: ' + (e?.message || 'error')); }
      }
      await ctx.reply(`✅ Sent ${sent} sticker${sent === 1 ? '' : 's'} from "${j.result.title}".` + (skipped ? ` (${skipped} skipped - animated Lottie stickers are not supported.)` : ''));
    } catch (e) {
      logger.warn('[telesticker] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not import that pack right now.');
    }
  },
};
