import config from '../config/config.js';
import { permitted } from '../permissions/index.js';
import { getMeta, findMember } from '../groups/perms.js';
import { parseAmount, fmt, addExpense, addPayment, removeExpense, clear, list, balances, settleUp } from '../expense/ledger.js';

const key = (m, fallback) => String(m?.phoneNumber || m?.id || fallback || '').split('@')[0].split(':')[0];
const tag = (k) => '@' + k;
function mentionedIds(msg) {
  const m = msg.message || {};
  const inner = m.ephemeralMessage?.message || m;
  for (const v of Object.values(inner)) if (v && typeof v === 'object' && v.contextInfo?.mentionedJid) return v.contextInfo.mentionedJid;
  return [];
}
export default {
  // 'split' alias dropped: the /split command's direct name always wins, so this alias was dead.
  name: 'expense', aliases: ['exp', 'kharcha'], category: 'Group',
  description: 'Split group expenses and see who owes whom',
  usage: 'expense add <amount> <what> @people | balance | settle | paid <amount> @person | list | delete <id> | clear',
  minArgs: 0,
  async run(ctx) {
    const p = config.prefix;
    if (!ctx.isGroup) return ctx.reply('Expense splitting works in groups.');
    const sub = (ctx.args[0] || 'help').toLowerCase();
    const meta = await getMeta(ctx.sock, ctx.jid).catch(() => null);
    const me = key(findMember(meta, ctx.senderJid, ctx.sender), ctx.sender);
    const ids = mentionedIds(ctx.msg).map((j) => key(findMember(meta, j), j)).filter(Boolean);
    const nameOf = (k) => tag(k);
    const send = (text, who = []) => ctx.sock.sendMessage(ctx.jid, { text, mentions: who.map((k) => k + '@s.whatsapp.net') }, { quoted: ctx.msg });
    if (sub === 'add') {
      const amount = parseAmount(ctx.args[1]);
      if (!amount) return ctx.reply(`Usage: ${p}expense add 1200 dinner @ravi @amit\nThe amount is split equally between you and the people you mention (add --all for the whole group).`);
      let split = [...new Set(ids)];
      const all = ctx.args.includes('--all');
      if (all) split = (meta?.participants || []).map((x) => key(x)).filter(Boolean).slice(0, 100);
      const desc = ctx.args.slice(2).filter((a) => !a.startsWith('@') && a !== '--all').join(' ');
      const r = addExpense(ctx.jid, { payer: me, amount, desc, split, name: ctx.msg.pushName });
      if (r.error) return ctx.reply(r.error + `\nMention who shares it: ${p}expense add 1200 dinner @ravi @amit`);
      const e = r.expense;
      return send(`🧾 Expense #${e.id}: ${fmt(amount)} for ${e.desc}\nPaid by ${nameOf(me)}, split ${e.split.length} ways (about ${fmt(r.share)} each).\nSee balances: ${p}expense balance`, e.split);
    }
    if (sub === 'balance' || sub === 'bal' || sub === 'settle') {
      const b = balances(ctx.jid); const t = settleUp(ctx.jid);
      if (!Object.keys(b).length) return ctx.reply(`No expenses yet. Add one: ${p}expense add 500 snacks @friend`);
      const who = new Set();
      let out = '💰 *Who owes whom*\n';
      if (!t.length) out += 'Everyone is settled up ✅';
      for (const x of t) { who.add(x.from); who.add(x.to); out += `• ${nameOf(x.from)} pays ${nameOf(x.to)} ${fmt(x.amount)}\n`; }
      if (t.length) out += `\nAfter paying, record it: ${p}expense paid <amount> @person`;
      return send(out.trim(), [...who]);
    }
    if (sub === 'paid') {
      const amount = parseAmount(ctx.args[1]); const to = ids[0];
      if (!amount || !to) return ctx.reply(`Usage: ${p}expense paid 400 @ravi  (you paid Ravi 400)`);
      const r = addPayment(ctx.jid, { from: me, to, amount });
      if (r.error) return ctx.reply(r.error);
      return send(`✅ Recorded: ${nameOf(me)} paid ${nameOf(to)} ${fmt(amount)}.`, [me, to]);
    }
    if (sub === 'list') {
      const L = list(ctx.jid);
      if (!L.expenses.length) return ctx.reply('No expenses yet.');
      const rows = L.expenses.slice(-15).map((e) => `#${e.id} ${fmt(e.amount)} ${e.desc} (paid by ${nameOf(e.payer)}, ${e.split.length} people)`);
      return send('🧾 *Recent expenses*\n' + rows.join('\n'), L.expenses.slice(-15).map((e) => e.payer));
    }
    if (sub === 'delete' || sub === 'del') {
      const id = parseInt(ctx.args[1], 10); if (!id) return ctx.reply(`Usage: ${p}expense delete <number from ${p}expense list>`);
      const adm = await permitted(ctx, { requiredLevel: 'admin' });
      const r = removeExpense(ctx.jid, id, me, adm); return ctx.reply(r.error || `🗑️ Deleted expense #${id}.`);
    }
    if (sub === 'clear' || sub === 'reset') {
      if (!await permitted(ctx, { requiredLevel: 'admin' })) return ctx.reply('Only group admins can clear the ledger.');
      clear(ctx.jid); return ctx.reply('🧹 Expense ledger cleared for this group.');
    }
    return ctx.reply(`💸 *Expense splitter*\n${p}expense add 1200 dinner @a @b - you paid, split equally with them\n${p}expense add 900 cab --all - split with everyone\n${p}expense balance - who pays whom\n${p}expense paid 400 @a - record a payback\n${p}expense list / delete <id> / clear (admin)`);
  },
};
