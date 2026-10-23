import { deletedEntries } from '../recover/store.js';
import { sendEntry, whoLine, quiet } from '../recover/index.js';

export default {
  name: 'deleted',
  aliases: ['recover'],
  category: 'Recover',
  description: 'Show recently deleted items I caught',
  usage: 'deleted [number]',
  ownerOnly: true,
  async run(ctx) {
    const to = await quiet(ctx);
    const items = deletedEntries();
    if (!items.length) return ctx.sock.sendMessage(to, { text: 'Nothing deleted since the recover feature started.' });
    const n = Number(ctx.args[0]);
    if (n >= 1 && items[n - 1]) return sendEntry(ctx.sock, to, items[n - 1], `Deleted ${items[n - 1].kind === 'status' ? 'status' : 'message'} from ${whoLine(items[n - 1])}`);
    const lines = items.slice(0, 15).map((e, i) => `${i + 1}. ${e.name || 'Unknown'} +${e.who} - ${e.type}${e.type === 'text' ? `: ${e.text.slice(0, 30)}` : ''}`);
    await ctx.sock.sendMessage(to, { text: `Recently deleted\n\n${lines.join('\n')}\n\nSend /deleted <number> to get one again.` });
  },
};
