// AFK: mark yourself away; Tab answers people who mention you.
import { featOn } from '../config/features.js';
import { setAfk, clearAfk } from '../fun/afk.js';

export default {
  name: 'afk', aliases: ['away', 'brb'], category: 'Group',
  description: 'Set yourself away - Tab tells people who tag you',
  usage: 'afk [reason]',
  async run(ctx) {
    if (!featOn('afk')) return ctx.reply('AFK is turned off right now.');
    if ((ctx.args[0] || '').toLowerCase() === 'off') {
      clearAfk(ctx.jid, ctx.sender);
      return ctx.reply('✅ You are no longer away.');
    }
    const reason = ctx.args.join(' ').trim().slice(0, 120);
    setAfk(ctx.jid, ctx.sender, ctx.msg?.pushName || ctx.sender, reason);
    return ctx.reply('💤 ' + (ctx.msg?.pushName || 'You') + ' is now away' + (reason ? ': ' + reason : '') + '. Send any message here to come back.');
  },
};
