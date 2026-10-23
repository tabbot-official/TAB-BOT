import config from '../config/config.js';
import logger from '../utils/logger.js';
import { askAi } from '../ai/providers.js';
import { recent } from '../chatlog/index.js';
import { replyFailure } from '../recovery/reply.js';
const stamps = new Map();
function allow(jid, now = Date.now()) { const a = (stamps.get(jid) || []).filter((t) => now - t < 3600000); if (a.length >= 4) return false; a.push(now); stamps.set(jid, a); if (stamps.size > 2000) stamps.clear(); return true; }
export function buildPrompt(msgs) {
  const lines = msgs.map((m) => `${m.who}: ${m.text}`).join('\n');
  return `Summarize this chat conversation for someone who missed it. Reply in the same language the chat mostly uses (Hinglish stays Hinglish). ` +
    `Use short bullet points: main topics, decisions, plans with dates/places, and who asked for what. Keep it under 180 words. ` +
    `Do not invent anything and do not judge anyone. Keep it friendly and family-friendly.\n\nChat:\n${lines}`;
}
export default {
  name: 'summary', aliases: ['summarize', 'tldr', 'recap'], category: 'AI',
  description: 'Summarize the last messages of this chat',
  usage: 'summary [number of messages, 20-300]', minArgs: 0,
  async run(ctx) {
    const n = Math.max(20, Math.min(300, parseInt(ctx.args[0], 10) || 100));
    const msgs = recent(ctx.jid, n);
    if (msgs.length < 8) return ctx.reply('I only see ' + msgs.length + ' recent messages here (I keep the last 300 for 24 hours, in memory only, starting when I joined this run). Try again after more chat.');
    if (!allow(ctx.jid)) return ctx.reply('Summary limit: 4 per hour in this chat. Try again later.');
    try {
      const r = await askAi(buildPrompt(msgs));
      await ctx.reply(`📝 *Summary of the last ${msgs.length} messages*\n\n${r.text.slice(0, 3000)}`);
    } catch (e) { logger.warn('summary failed'); await replyFailure(ctx, 'summary', e); }
  },
};
