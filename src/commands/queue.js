// Owner command queue: commands saved on disk that run whenever Tab is online.
// Lives in data/catchup.json, separate from the auth session - survives restarts,
// crashes and re-pairing. (WhatsApp itself only redelivers missed messages for a
// limited time; this queue is the part that never expires.)
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import * as catchup from '../utilities/catchup.js';
import { handleMessage } from '../handlers/messageHandler.js';

export default {
  name: 'queue',
  aliases: ['q'],
  category: 'Owner',
  description: 'Persistent command queue - runs when Tab is online (owner only)',
  usage: 'queue | queue add /<command> | queue run | queue clear',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('catchup')) return ctx.reply('Catch-up and the command queue are turned off right now.');
    const [sub, ...rest] = ctx.args;
    const P = config.prefix;
    if (!sub || sub === 'list') {
      const q = catchup.listQueue();
      if (!q.length) return ctx.reply('The queue is empty. Add one: ' + P + 'queue add /play kesariya');
      return ctx.reply('*Command queue* (' + q.length + ')\n' + q.map((x, i) => (i + 1) + '. ' + x.text + (x.manual ? '' : ' (missed while offline)')).join('\n') + '\n\n' + P + 'queue run to run them now, ' + P + 'queue clear to empty.');
    }
    if (sub === 'add') {
      const text = rest.join(' ').trim();
      if (!text.startsWith(P)) return ctx.reply('Give me a full command starting with ' + P + ' - example: ' + P + 'queue add /play kesariya');
      if (text.slice(P.length).trim().split(/\s+/)[0].toLowerCase() === 'queue') return ctx.reply('Nice try - a queue cannot queue itself.');
      return ctx.reply(catchup.enqueue(text) ? 'Saved. It will run when I am online (' + P + 'queue run to run now).' : 'The queue is full (50). Run or clear some first.');
    }
    if (sub === 'run') {
      const n = await catchup.drain(ctx.sock, handleMessage);
      return ctx.reply(n ? 'Ran ' + n + ' queued command(s).' : 'Nothing queued.');
    }
    if (sub === 'clear') { catchup.clearQueue(); return ctx.reply('Queue cleared.'); }
    return ctx.reply('Usage: ' + P + 'queue | add /<command> | run | clear');
  },
};
