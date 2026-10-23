import {setOff, isOff, banByNumber, unbanAll, bannedCount} from '../confess/index.js';
export default {
  name: 'confessions', aliases: ['confessmod'], category: 'Group', requiredLevel: 'admin',
  description: 'Admins: confession box on/off and ban abusers', usage: 'confessions on|off | ban #12 | unbanall', minArgs: 0,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Use this inside the group.');
    const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'on' || sub === 'off') { setOff(ctx.jid, sub === 'off'); return ctx.reply(`Confession box is now ${sub.toUpperCase()}.`); }
    if (sub === 'ban') {
      const n = Number(String(ctx.args[1] || '').replace('#', ''));
      if (!Number.isInteger(n)) return ctx.reply('Use: confessions ban #12 (the confession number).');
      return ctx.reply(banByNumber(ctx.jid, n) ? `The sender of #${n} can no longer post confessions here. Their identity stays hidden.` : 'I do not have a record of that number (only the last 300 are kept).');
    }
    if (sub === 'unbanall') return ctx.reply(`Unbanned ${unbanAll(ctx.jid)} sender(s).`);
    await ctx.reply(`Confession box: ${isOff(ctx.jid) ? 'OFF' : 'ON'}. Banned senders: ${bannedCount(ctx.jid)}.\nCommands: confessions on|off, confessions ban #12, confessions unbanall.\nBlocked words come from /blockword; links and phone numbers are always refused.`);
  },
};
