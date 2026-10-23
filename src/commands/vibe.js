import {vibe, render, groupMood} from '../vibe/index.js';
import {dailyTotals} from '../groups/activity.js';

const num = (j) => String(j || '').split('@')[0].split(':')[0];
export default {
  name: 'vibe', aliases: ['vibecheck', 'mood'], category: 'Fun',
  description: 'Daily vibe check for you, a friend (@mention) or the group',
  usage: 'vibe | vibe @friend | vibe group', minArgs: 0,
  async run(ctx) {
    if ((ctx.args[0] || '').toLowerCase() === 'group') {
      if (!ctx.isGroup) return ctx.reply('Use this inside a group.');
      const d = dailyTotals(ctx.jid, 7); const today = d.at(-1)?.msgs || 0; const prev = d.slice(0, -1); const avg = prev.reduce((a, b) => a + b.msgs, 0) / Math.max(1, prev.length);
      const m = groupMood(today, avg);
      return ctx.reply(`🌡️ *Group vibe today*\n${m.label}\n${m.note}\n${today} messages so far.`);
    }
    const ment = ctx.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = ment || ctx.senderJid || ctx.sender;
    const name = ment ? '@' + num(ment) : (ctx.msg?.pushName || 'You');
    const text = render(name, vibe(num(target)));
    if (ment) return ctx.sock.sendMessage(ctx.jid, {text, mentions: [ment]}, {quoted: ctx.msg});
    await ctx.reply(text);
  },
};
