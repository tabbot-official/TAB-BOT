import {askAi} from '../ai/providers.js';
import config from '../config/config.js';
import {MAX_IN, isMostlyEmoji, encodePrompt, decodePrompt, cleanEncoded} from '../emojitr/index.js';

const hits = new Map();
const ok = (u, now = Date.now()) => { const a = (hits.get(u) || []).filter((t) => now - t < 60000); if (a.length >= 4) return false; hits.set(u, [...a, now]); if (hits.size > 3000) hits.clear(); return true; };

export default {
  name: 'emoji', aliases: ['emojitranslate', 'emo'], category: 'Fun',
  description: 'Emoji translator: text to emojis, or decode an emoji message (reply to one)',
  usage: 'emoji <text>  or  emoji (reply to an emoji message)', minArgs: 0,
  async run(ctx) {
    const quoted = ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const qText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const input = (ctx.args.join(' ') || qText).trim().slice(0, MAX_IN);
    if (!input) return ctx.reply(`Use: ${config.prefix}emoji I love pizza\nor reply to an emoji message with ${config.prefix}emoji to decode it.`);
    if (!ok(ctx.sender)) return ctx.reply('Max 4 per minute 😄');
    try {
      if (isMostlyEmoji(input)) return ctx.reply('🔎 ' + (await askAi(decodePrompt(input))).text.slice(0, 400));
      const out = cleanEncoded((await askAi(encodePrompt(input))).text);
      await ctx.reply(out || 'Could not make a good emoji version of that. Try simpler words.');
    } catch (e) { await ctx.reply(e?.code === 'NO_KEYS' ? 'AI is not set up on this bot.' : 'Emoji brain is busy. Try again in a minute.'); }
  },
};
