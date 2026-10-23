import config from '../config/config.js';
import {open, get, draw, cancel, label} from '../santa/index.js';

export default {
  name: 'santaadmin', aliases: ['santamod'], category: 'Group', requiredLevel: 'admin',
  description: 'Admins: start, draw or cancel the Secret Santa', usage: 'santaadmin start <note> | draw | cancel', minArgs: 1,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Use this inside the group.');
    const p = config.prefix; const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'start') { const g = open(ctx.jid, ctx.args.slice(1).join(' ')); return ctx.reply(`🎅 *Secret Santa is open!*${g.note ? '\n' + g.note : ''}\nEveryone: ${p}santa join\nWhen ready, an admin runs ${p}santaadmin draw`); }
    if (sub === 'cancel') return ctx.reply(cancel(ctx.jid) ? 'Secret Santa cancelled.' : 'Nothing to cancel.');
    if (sub === 'draw') {
      const cur = get(ctx.jid);
      if (!cur || cur.state !== 'open') return ctx.reply('No open Secret Santa. Start one first.');
      if (cur.players.length < 3) return ctx.reply('Need at least 3 players to draw.');
      const g = draw(ctx.jid); let fail = 0;
      for (const pl of g.players) {
        try { await ctx.sock.sendMessage(pl.jid, {text: `🎁 *Secret Santa draw!* You are Santa for: *${label(g, g.pairs[pl.jid])}*${g.note ? '\nNote: ' + g.note : ''}\nShh, keep it secret!`}); await new Promise((r) => setTimeout(r, 1200)); } catch { fail++; }
      }
      return ctx.reply(`✅ Draw done for ${g.players.length} players. Everyone got a private DM.${fail ? `\n${fail} DM(s) failed - those people can send ${p}santa mine after messaging me once.` : ''}`);
    }
    await ctx.reply(`Use: ${p}santaadmin start <note> | draw | cancel`);
  },
};
