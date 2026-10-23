import { downloadMediaMessage } from '@whiskeysockets/baileys';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { findMedia } from '../utils/imageTools.js';
import { OPS, runOp } from './imageops.js';
// Image & Sticker: reply to or send a photo with the command. Edits happen on the bot, no photo leaves the server.
const mk = ([name, o]) => ({
  name, category: 'Image & Sticker', description: o.d, usage: `${name}${o.u ? ' ' + o.u : ''} (send or reply to a photo)`, aliases: [], minArgs: 0,
  pack: true, web: false, ownerOnly: false, group: false, image: true, tests: [['', 'photo']], fn: null,
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image' || media.animated) return ctx.reply(`Send or reply to a photo with ${config.prefix}${name}`);
    if (Number(media.node?.fileLength) > 10 * 1048576) return ctx.reply('Photo is too big (max 10MB).');
    try {
      const sharp = (await import('sharp')).default;
      const input = await downloadMediaMessage(media.message, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      const { buf, fmt } = await runOp(sharp, name, input, ctx.args);
      if (o.sticker) await ctx.sock.sendMessage(ctx.jid, { sticker: buf }, { quoted: ctx.msg });
      else if (fmt === 'webp' || OPS[name].out) await ctx.sock.sendMessage(ctx.jid, { document: buf, mimetype: `image/${fmt}`, fileName: `tab.${fmt === 'jpeg' ? 'jpg' : fmt}` }, { quoted: ctx.msg });
      else await ctx.sock.sendMessage(ctx.jid, { image: buf, caption: `Done: ${name}` }, { quoted: ctx.msg });
    } catch (e) { logger.warn(`${name} failed: ${e?.message}`); await ctx.reply('Could not edit that photo. Try a normal JPG or PNG under 10MB.'); }
  },
});
export default Object.entries(OPS).map(mk);
