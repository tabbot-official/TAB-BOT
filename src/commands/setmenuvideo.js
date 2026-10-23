// MENUVID (video): owner sets the video that leads /menu. Reply to a video.
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { findMedia } from '../utils/imageTools.js';
import { saveMenuMedia, clearMenuMedia, MAX_BYTES } from '../utilities/menumedia.js';

export default {
  name: 'setmenuvideo', aliases: ['menuvideo'], category: 'Owner',
  description: 'Set the video shown at the top of /menu (reply to a video)',
  usage: 'setmenuvideo (reply to a video) | setmenuvideo off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('menuvid')) return ctx.reply('Menu media is turned off right now.');
    if ((ctx.args[0] || '').toLowerCase() === 'off') { clearMenuMedia(); return ctx.reply('Menu media removed. /menu is text-only again.'); }
    const found = findMedia(ctx.msg);
    if (!found || !found.node.videoMessage) return ctx.reply('Reply to a VIDEO with /setmenuvideo (max 8MB).');
    if (Number(found.node.videoMessage.fileLength) > MAX_BYTES) return ctx.reply('That video is too big (max 8MB).');
    try {
      const buf = await downloadMediaMessage(found.message, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      if (!buf?.length || buf.length > MAX_BYTES) return ctx.reply('That video is too big (max 8MB).');
      saveMenuMedia('video', buf);
      return ctx.reply('🎬 Menu video set. Send /menu to see it.');
    } catch (e) { logger.warn('[setmenuvideo] ' + (e?.message || 'error')); return ctx.reply('Could not save that video. Try a smaller one.'); }
  },
};
