import {screen, MAX_LEN, isOff, isBanned, record} from '../confess/index.js';
import {store} from '../groups/store.js';
import {getMeta, findMember} from '../groups/perms.js';

const last = new Map();
export const COOLDOWN_MS = 60000;
export {MAX_LEN};

async function myGroups(ctx) {
  const all = Object.values(await ctx.sock.groupFetchAllParticipating().catch(() => ({})));
  const mine = [];
  for (const g of all) { if (mine.length >= 15) break; const meta = await getMeta(ctx.sock, g.id).catch(() => null); if (meta && findMember(meta, ctx.senderJid) && !isOff(g.id)) mine.push({ id: g.id, name: meta.subject }); }
  return mine;
}

export default {
  name: 'confess', aliases: ['confession'], category: 'Games',
  description: 'Anonymous confession box (works in the group, or privately in DM)',
  usage: 'confess <text>  |  in DM: confess <group number> <text>', minArgs: 0,
  async run(ctx) {
    const now = Date.now();
    let gid = ctx.jid; let text = (ctx.args || []).join(' ').replace(/\s+/g, ' ').trim(); let viaDm = false;
    if (!ctx.isGroup) {
      viaDm = true;
      const groups = await myGroups(ctx);
      const pick = Number(ctx.args[0]);
      if (!groups.length) return ctx.reply('I could not find a group we are both in that has confessions on.');
      if (!Number.isInteger(pick) || pick < 1 || pick > groups.length || ctx.args.length < 2) return ctx.reply('Send: confess <number> <your confession>\n\n' + groups.map((x, i) => `${i + 1}. ${x.name}`).join('\n') + '\n\nThis is fully private: the group only sees the text.');
      gid = groups[pick - 1].id; text = ctx.args.slice(1).join(' ').replace(/\s+/g, ' ').trim();
    }
    if (isOff(gid)) return ctx.reply('Confessions are turned off in this group.');
    if (text.length < 3) return ctx.reply('Write your confession after the command.');
    if (text.length > MAX_LEN) return ctx.reply(`Too long. Keep it under ${MAX_LEN} characters.`);
    if (isBanned(gid, ctx.sender)) return ctx.reply('You cannot post confessions in this group.');
    const prev = last.get(ctx.sender) || 0;
    if (now - prev < COOLDOWN_MS) return ctx.reply('Please wait a minute before sending another confession.');
    const bad = screen(text, store()?.words(gid) || []);
    if (bad) return ctx.reply(bad);
    last.set(ctx.sender, now); if (last.size > 2000) last.clear();
    try {
      if (!viaDm && ctx.msg?.key) await ctx.sock.sendMessage(ctx.jid, {delete: ctx.msg.key}).catch(() => {}); // hide the sender (bot must be admin)
      const n = record(gid, ctx.sender);
      await ctx.sock.sendMessage(gid, {text: `🤫 *Confession #${n}*\n\n"${text}"\n\n_Anonymous. Send yours privately to me with ${'/'}confess._`});
      if (viaDm) await ctx.reply(`Posted as Confession #${n}.`);
    } catch { last.delete(ctx.sender); return ctx.reply('Could not post the confession right now. Try again.'); }
  },
};
