import {capsules} from '../ops/index.js';
import config from '../config/config.js';
import {parseWhen, PER_USER, MAX_DAYS} from '../capsule/index.js';

const who = (ctx) => String(ctx.senderJid || ctx.sender || '').split(':')[0].split('@')[0];
const mine = (ctx) => capsules.jobs.filter((j) => j.owner === who(ctx) && j.state === 'waiting');
const fmt = (t) => new Date(t).toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric'});

export default {
  name: 'capsule', aliases: ['timecapsule'], category: 'Utilities',
  description: 'Seal a message that opens on a future date',
  usage: 'capsule 2027-01-01 <message> | capsule 6mo <message> | capsule list | capsule cancel <id>', minArgs: 1,
  async run(ctx) {
    const p = config.prefix; const act = (ctx.args[0] || '').toLowerCase();
    if (act === 'list') { const l = mine(ctx).sort((a, b) => a.at - b.at); return ctx.reply(l.length ? '📦 Your sealed capsules:\n' + l.map((j) => `${j.id}: opens ${fmt(j.at)}`).join('\n') + `\n\nCancel: ${p}capsule cancel <id>` : 'You have no sealed capsules.'); }
    if (act === 'cancel') { const id = ctx.args[1]; if (!id || !mine(ctx).some((j) => j.id === id)) return ctx.reply('No capsule of yours with that id.'); capsules.cancel(id); return ctx.reply('Capsule cancelled.'); }
    const w = parseWhen(ctx.args);
    if (!w) return ctx.reply(`When should it open? Examples:\n${p}capsule 2027-01-01 happy new year\n${p}capsule 6mo remember to call mom\n${p}capsule 1y how are you now?`);
    if (!w.rest) return ctx.reply('Write the message to seal after the date.');
    if (w.rest.length > 500) return ctx.reply('Capsule message: max 500 characters.');
    if (w.at - Date.now() < 86400000) return ctx.reply('A capsule must open at least 1 day from now (for sooner use ' + p + 'remind).');
    if (w.at - Date.now() > MAX_DAYS * 86400000) return ctx.reply('Max 5 years ahead.');
    if (mine(ctx).length >= PER_USER) return ctx.reply(`You already have ${PER_USER} sealed capsules. Cancel one first (${p}capsule list).`);
    const sealed = fmt(Date.now());
    const body = ctx.isGroup ? `@${who(ctx)} sealed this on ${sealed}:\n\n"${w.rest}"` : `You sealed this on ${sealed}:\n\n"${w.rest}"`;
    try {
      const j = capsules.create(body, w.at, ctx.jid, who(ctx));
      await ctx.reply(`📦 Capsule sealed. It will open on ${fmt(w.at)}${ctx.isGroup ? ' right here in this group' : ' in this chat'}.\nid: ${j.id}`);
    } catch { await ctx.reply('Could not seal the capsule right now. Try again later.'); }
  },
};
