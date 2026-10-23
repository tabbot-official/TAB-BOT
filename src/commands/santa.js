import config from '../config/config.js';
import {get, join, leave, label, MAX_PLAYERS} from '../santa/index.js';

export default {
  name: 'santa', aliases: ['secretsanta'], category: 'Fun',
  description: 'Secret Santa: join the gift exchange in this group',
  usage: 'santa join | leave | list | mine', minArgs: 0,
  async run(ctx) {
    if (!ctx.isGroup) return ctx.reply('Secret Santa works inside a group.');
    const p = config.prefix; const sub = (ctx.args[0] || 'list').toLowerCase(); const g = get(ctx.jid);
    if (!g) return ctx.reply(`No Secret Santa here yet. An admin can start one: ${p}santaadmin start <budget or note>`);
    const me = ctx.senderJid;
    if (sub === 'join') {
      const r = join(ctx.jid, me, ctx.msg?.pushName);
      return ctx.reply({ok: `🎅 You're in! ${g.players.length} joined so far.`, already: 'You already joined.', full: `Full (max ${MAX_PLAYERS}).`, closed: 'Joining is closed (the draw is done).'}[r]);
    }
    if (sub === 'leave') return ctx.reply(leave(ctx.jid, me) ? 'You left the Secret Santa.' : 'You were not in, or the draw is already done.');
    if (sub === 'mine') {
      if (g.state !== 'drawn' || !g.pairs[me]) return ctx.reply('No draw for you yet.');
      try { await ctx.sock.sendMessage(me, {text: `🎁 Your Secret Santa person: *${label(g, g.pairs[me])}*${g.note ? '\nNote: ' + g.note : ''}\nShh, keep it secret!`}); return ctx.reply('Sent you a DM 🤫'); } catch { return ctx.reply('Could not DM you. Message me once in private and try again.'); }
    }
    await ctx.reply(`🎅 *Secret Santa* (${g.state === 'open' ? 'signups open' : 'draw done'})${g.note ? '\n' + g.note : ''}\n${g.players.length} player(s): ${g.players.map((x) => x.name || '+' + x.jid.split('@')[0]).join(', ') || 'none yet'}\n${g.state === 'open' ? `Join: ${p}santa join` : `Forgot yours? ${p}santa mine`}`);
  },
};
