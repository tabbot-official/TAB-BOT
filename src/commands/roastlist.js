import {askAi} from '../ai/providers.js';
import config from '../config/config.js';
import {parseSongs, hasLink, buildPrompt, cleanRoast, MIN_SONGS} from '../roast/index.js';

const hits = new Map();
const ok = (u, now = Date.now()) => { const a = (hits.get(u) || []).filter((t) => now - t < 300000); if (a.length >= 3) return false; hits.set(u, [...a, now]); if (hits.size > 3000) hits.clear(); return true; };

export default {
  name: 'roastlist', aliases: ['roastplaylist', 'playlistroast'], category: 'Fun',
  description: 'Friendly roast of your playlist (paste your songs)',
  usage: 'roastlist song1, song2, song3  |  roastlist mild <songs>  |  reply to a song list with roastlist', minArgs: 0,
  async run(ctx) {
    const quoted = ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const qText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    let args = ctx.args.slice(); let mode = 'medium';
    if (['mild', 'soft', 'sweet'].includes((args[0] || '').toLowerCase())) { mode = 'mild'; args = args.slice(1); }
    const text = args.join(' ') || qText;
    const songs = parseSongs(text);
    const p = config.prefix;
    if (songs.length < MIN_SONGS) {
      const link = hasLink(text) ? 'I cannot open playlist links. ' : '';
      return ctx.reply(`🔥 ${link}Paste at least ${MIN_SONGS} songs, one per line or separated by commas.\nExample:\n${p}roastlist Kesariya, Despacito, Baby Shark, Tum Hi Ho\nSofter version: ${p}roastlist mild <songs>`);
    }
    if (!ok(ctx.sender)) return ctx.reply('Max 3 roasts per 5 minutes. Let the playlist cool down 😄');
    try {
      const out = cleanRoast((await askAi(buildPrompt(songs, mode))).text);
      await ctx.reply(out ? '🔥 *Playlist roast*\n\n' + out : 'Could not come up with a good roast. Try adding more songs.');
    } catch (e) { await ctx.reply(e?.code === 'NO_KEYS' ? 'AI is not set up on this bot.' : 'The roast chef is busy. Try again in a minute.'); }
  },
};
