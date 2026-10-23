// MENUVID (image): owner sets the picture that leads /menu. Reply to an image.
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { findMedia } from '../utils/imageTools.js';
import { saveMenuMedia, clearMenuMedia, MAX_BYTES } from '../utilities/menumedia.js';

export default {
  name: 'setmenuimage', aliases: ['menuimage'], category: 'Owner',
  description: 'Set the image shown at the top of /menu (reply to an image)',
  usage: 'setmenuimage (reply to an image) | setmenuimage off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('menuvid')) return ctx.reply('Menu media is turned off right now.');
    if ((ctx.args[0] || '').toLowerCase() === 'off') { clearMenuMedia(); return ctx.reply('Menu media removed. /menu is text-only again.'); }
    const found = findMedia(ctx.msg);
    if (!found || !found.node.imageMessage) return ctx.reply('Reply to an IMAGE with /setmenuimage.');
    if (Number(found.node.imageMessage.fileLength) > MAX_BYTES) return ctx.reply('That image is too big (max 8MB).');
    try {
      const buf = await downloadMediaMessage(found.message, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      if (!buf?.length || buf.length > MAX_BYTES) return ctx.reply('That image is too big (max 8MB).');
      saveMenuMedia('image', buf);
      return ctx.reply('🖼 Menu image set. Send /menu to see it.');
    } catch (e) { logger.warn('[setmenuimage] ' + (e?.message || 'error')); return ctx.reply('Could not save that image. Try another one.'); }
  },
};
