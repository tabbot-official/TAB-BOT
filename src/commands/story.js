import config from '../config/config.js';
import {start, add, get, text, end, MAX_LINES} from '../story/index.js';

export default {
  name: 'story', aliases: ['storychain'], category: 'Games',
  description: 'Build a story together, one sentence each',
  usage: 'story start <opening> | add <sentence> | show | end', minArgs: 0,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Story chain is for groups.');
    const p = config.prefix; const sub = (ctx.args[0] || 'show').toLowerCase(); const rest = ctx.args.slice(1).join(' '); const me = String(ctx.senderJid || ctx.sender);
    if (sub === 'start') { const r = start(ctx.jid, me, rest); return ctx.reply(r.err || `📖 *Story started!*\n\n${rest}\n\nAdd the next sentence: ${p}story add <your sentence>`); }
    if (sub === 'add') { const r = add(ctx.jid, me, rest); return ctx.reply(r.err || `✅ Added (${r.n}/${MAX_LINES}).\n\n…${text(ctx.jid).slice(-300)}`); }
    if (sub === 'end') {
      const s = get(ctx.jid); if (!s) return ctx.reply('No story running.');
      if (s.by !== me && !ctx.isOwner) return ctx.reply('Only the person who started it (or the bot owner) can end the story.');
      return ctx.reply(`📚 *The final story*\n\n${end(ctx.jid)}\n\nThe End. ${p}story start for a new one!`);
    }
    const s = get(ctx.jid); if (!s) return ctx.reply(`No story yet. ${p}story start <opening line>`);
    await ctx.reply(`📖 *Story so far* (${s.lines.length} lines)\n\n${text(ctx.jid).slice(-1500)}\n\nAdd: ${p}story add <sentence>`);
  },
};
