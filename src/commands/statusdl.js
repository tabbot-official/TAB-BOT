import { list } from '../recover/store.js';
import { sendEntry, whoLine, quiet } from '../recover/index.js';
import { sleep } from '../utils/helpers.js';

const ago = (ts) => { const m = Math.max(1, Math.round((Date.now() - ts) / 60000)); return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`; };

export default {
  name: 'statusdl',
  aliases: ['sdl', 'savestatus'],
  category: 'Recover',
  description: 'List and download saved WhatsApp statuses',
  usage: 'statusdl [number | all | name]',
  ownerOnly: true,
  async run(ctx) {
    const to = await quiet(ctx);
    const all = list((e) => e.kind === 'status' && !e.deleted);
    if (!all.length) return ctx.sock.sendMessage(to, { text: 'No statuses saved yet. I save statuses that appear while I am online. Older ones cannot be recovered.' });
    const arg = (ctx.args.join(' ') || '').trim().toLowerCase();
    let pick = null;
    if (/^\d{1,3}$/.test(arg)) pick = [all[Number(arg) - 1]].filter(Boolean);
    else if (arg === 'all') pick = all.slice(0, 15);
    else if (arg) pick = all.filter((e) => e.who.includes(arg.replace(/\D/g, '') || '@@') || (e.name || '').toLowerCase().includes(arg)).slice(0, 15);
    if (pick) {
      if (!pick.length) return ctx.sock.sendMessage(to, { text: 'No saved status matches that.' });
      for (const e of pick) { await sendEntry(ctx.sock, to, e, `Status from ${whoLine(e)} (${ago(e.ts)} ago)`); await sleep(1200); }
      return;
    }
    const lines = all.slice(0, 30).map((e, i) => `${i + 1}. ${e.name || 'Unknown'} +${e.who} - ${e.type} - ${ago(e.ts)} ago`);
    await ctx.sock.sendMessage(to, { text: `Saved statuses (${all.length})\n\n${lines.join('\n')}\n\nSend ${ctx.args.length ? '' : '/statusdl '}a number, a name, or "all" to download.` });
  },
};
