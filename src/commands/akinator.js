import config from '../config/config.js';
import {key, start, stop, active} from '../akinator/index.js';

export default {
  name: 'akinator', aliases: ['mindreader', 'guess20'], category: 'Games',
  description: 'Think of a character, animal or thing - the AI guesses it with yes/no questions',
  usage: 'akinator [category] | akinator stop', minArgs: 0,
  async run(ctx) {
    const k = key(ctx.jid, ctx.sender); const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'stop') { stop(k); return ctx.reply('Game ended.'); }
    if (active(k)) return ctx.reply(`A game is running. Just answer yes / no / maybe / don't know, or ${config.prefix}akinator stop.`);
    await ctx.reply('🔮 *Mind reader*\nThink of a character, famous person, animal or object. Do not tell me!\nAnswer my questions with yes / no / maybe / don\'t know. Max 20 questions.');
    const r = await start(k, ctx.args.join(' '));
    await ctx.reply(r.text);
  },
};
