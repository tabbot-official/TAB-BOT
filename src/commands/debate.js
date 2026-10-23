import {askAi} from '../ai/providers.js';
import config from '../config/config.js';
import {cleanTopic, allowed, buildPrompt} from '../debate/index.js';

const hits = new Map();
const ok = (u, now = Date.now()) => { const a = (hits.get(u) || []).filter((t) => now - t < 60000); if (a.length >= 2) return false; hits.set(u, [...a, now]); if (hits.size > 3000) hits.clear(); return true; };

export default {
  name: 'debate', aliases: ['aidebate'], category: 'AI',
  description: 'AI debate: two sides argue any topic, then a judge picks a winner',
  usage: 'debate <topic>  e.g. debate cricket vs football', minArgs: 1,
  async run(ctx) {
    const topic = cleanTopic(ctx.args.join(' '));
    if (!allowed(topic)) return ctx.reply(`Give me a fun topic, e.g. ${config.prefix}debate chai vs coffee`);
    if (!ok(ctx.sender)) return ctx.reply('Max 2 debates per minute. Let the teams rest 😄');
    try {
      const r = await askAi(buildPrompt(topic));
      await ctx.reply(`🎤 *Debate: ${topic}*\n\n${r.text.slice(0, 2200)}`);
    } catch (e) {
      await ctx.reply(e?.code === 'NO_KEYS' ? 'AI is not set up on this bot.' : 'The debaters are busy. Try again in a minute.');
    }
  },
};
