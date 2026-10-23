import {range} from '../groups/activity.js';
import {summarize, render} from '../groups/wrapped.js';

export default {
  name: 'wrapped', aliases: ['chatwrapped', 'groupwrapped'], category: 'Group',
  description: 'Group chat wrapped: top chatters, busiest day and hour',
  usage: 'wrapped [7|30|90]', minArgs: 0,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Use this inside a group.');
    const n = Number(ctx.args[0]); const span = [7, 30, 90].includes(n) ? n : 30;
    let subject = 'This group';
    try { subject = (await ctx.sock.groupMetadata(ctx.jid)).subject || subject; } catch { /* keep default */ }
    const {text, mentions} = render(summarize(range(ctx.jid, span)), subject, span);
    await ctx.sock.sendMessage(ctx.jid, {text, mentions}, {quoted: ctx.msg});
  },
};
