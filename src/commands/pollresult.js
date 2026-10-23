import { lastPoll, formatResult, closePoll } from '../polls/index.js';
import { permitted } from '../permissions/index.js';
export default {
  name: 'pollresult', aliases: ['pollresults', 'pollclose'], category: 'Group',
  description: 'Show the vote count of the latest poll (add close to end it)',
  usage: 'pollresult [close]', minArgs: 0,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Polls work in groups only.');
    const p = lastPoll(ctx.jid);
    if (!p) return ctx.reply('No tracked poll in this chat yet. Create one with /poll (only polls made after this update are counted).');
    if ((ctx.args[0] || '').toLowerCase() === 'close') {
      if (p.creator !== ctx.sender && !await permitted(ctx, { requiredLevel: 'admin' })) return ctx.reply('Only the poll creator or a group admin can close it.');
      if (p.closed) return ctx.reply('That poll is already closed.');
      await closePoll(ctx.sock, p.id); return;
    }
    return ctx.reply((p.closed ? '🔒 ' : '🗳️ ') + formatResult(p));
  },
};
