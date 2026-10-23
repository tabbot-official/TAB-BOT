// GETABOUT: show a user's WhatsApp about/status text.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

export default {
  name: 'getabout', aliases: ['about', 'bio2'], category: 'Tools',
  description: "Show someone's WhatsApp about text",
  usage: 'getabout @user (or reply to their message)',
  async run(ctx) {
    if (!featOn('getabout')) return ctx.reply('About lookup is turned off right now.');
    const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      || ctx.msg.message?.extendedTextMessage?.contextInfo?.participant
      || (!ctx.isGroup ? ctx.jid : null);
    if (!mentioned) return ctx.reply('Mention someone or reply to their message. Example: ' + config.prefix + 'getabout @user');
    try {
      const s = await ctx.sock.fetchStatus(mentioned);
      const num = mentioned.split('@')[0].split(':')[0];
      if (!s?.status) return ctx.sock.sendMessage(ctx.jid, { text: '@' + num + ' has no about text (or it is private).', mentions: [mentioned]  }, { quoted: ctx.msg });
      return ctx.reply('*About @' + num + ':*\n' + s.status + (s.setAt ? '\n\n(set ' + new Date(s.setAt).toLocaleDateString('en-IN') + ')' : ''), { mentions: [mentioned] });
    } catch (e) {
      logger.warn('[getabout] failed: ' + (e?.message || 'error'));
      return ctx.reply('Could not read that about text (privacy settings may hide it).');
    }
  },
};
