import {birthdays} from '../ops/index.js';
import config from '../config/config.js';
import {parseDate} from '../birthday/index.js';

const digits = (j) => String(j || '').split(':')[0].split('@')[0];
const me = (ctx) => digits(ctx.senderJid || ctx.sender);
function mentionedIds(msg) {
  const m = msg.message || {}; const inner = m.ephemeralMessage?.message || m;
  for (const v of Object.values(inner)) if (v && typeof v === 'object' && v.contextInfo?.mentionedJid) return v.contextInfo.mentionedJid;
  return [];
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default {
  name: 'birthday', aliases: ['bday', 'birthdays'], category: 'Group',
  description: 'Auto birthday wishes every year at 9 AM',
  usage: 'birthday add @friend 14-03 | birthday add Mom 2 Nov | birthday me 14-03 | birthday list | birthday remove <name or id>', minArgs: 1,
  async run(ctx) {
    const p = config.prefix; const act = (ctx.args[0] || '').toLowerCase(); const chat = ctx.jid;
    if (act === 'list') {
      const l = birthdays.inChat(chat).sort((a, b) => a.month - b.month || a.day - b.day);
      return ctx.reply(l.length ? '🎂 Birthdays here:\n' + l.map((b) => `${b.day} ${MON[b.month - 1]} - ${b.who ? '@' + b.who : b.name} (${b.id})`).join('\n') : `No birthdays saved here. Add one: ${p}birthday add @friend 14-03`);
    }
    if (act === 'remove' || act === 'delete' || act === 'del') {
      const key = ctx.args.slice(1).join(' ').replace(/^@/, '');
      const hit = birthdays.inChat(chat).find((b) => b.id === key.toLowerCase() || b.name.toLowerCase() === key.toLowerCase() || b.who === key);
      if (!hit) return ctx.reply(`Not found. See ${p}birthday list.`);
      if (!ctx.isOwner && hit.by !== me(ctx) && hit.who !== me(ctx)) return ctx.reply('Only the person who added it, the birthday person, or the owner can remove it.');
      birthdays.remove(chat, hit.id); return ctx.reply('Removed.');
    }
    if (act !== 'add' && act !== 'me') return ctx.reply(`Usage:\n${p}birthday add @friend 14-03\n${p}birthday add Mom 2 Nov\n${p}birthday me 14-03\n${p}birthday list\n${p}birthday remove <name>`);
    const rest = ctx.args.slice(1);
    const ment = ctx.isGroup ? mentionedIds(ctx.msg).map(digits).filter(Boolean)[0] : null;
    let who = null; let name; let dateText;
    if (act === 'me') { dateText = rest.join(' '); who = ctx.isGroup ? me(ctx) : null; name = ctx.msg?.pushName || 'you'; }
    else {
      // date is the trailing 1-3 tokens; the leading part is the name or a @mention
      let d = null; let cut = rest.length;
      for (const n of [3, 2, 1]) { if (rest.length > n - 0 && (d = parseDate(rest.slice(-n).join(' ')))) { cut = rest.length - n; break; } d = null; }
      if (!d && rest.length === 1) d = null;
      dateText = d ? rest.slice(cut).join(' ') : '';
      name = rest.slice(0, cut).join(' ').replace(/@\d{6,}/g, '').trim();
      if (ment) { who = ment; name = name || ment; }
    }
    const date = parseDate(dateText);
    if (!date) return ctx.reply(`I need the date as day-month, like 14-03 or 14 Mar.\nExample: ${p}birthday add @friend 14-03`);
    if (!name) return ctx.reply('Whose birthday? Mention them in a group or write a name.');
    try {
      const b = birthdays.add({chat, name, day: date.day, month: date.month, who, by: me(ctx)});
      await ctx.reply(`🎂 Saved: ${who ? '@' + who : b.name} on ${b.day} ${MON[b.month - 1]}.\nI will ${ctx.isGroup ? 'wish them here' : 'remind you'} every year at 9 AM IST.`);
    } catch (e) {
      await ctx.reply(e.message === 'birthday_chat_full' ? 'This chat already has 25 birthdays. Remove one first.' : 'Could not save that birthday right now.');
    }
  },
};
