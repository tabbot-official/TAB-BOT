import config from '../config/config.js';
import {SOUNDS, names, render} from '../soundboard/index.js';

const hits = new Map();
const ok = (u, max = 6, now = Date.now()) => { const a = (hits.get(u) || []).filter((t) => now - t < 60000); if (a.length >= max) return false; hits.set(u, [...a, now]); if (hits.size > 3000) hits.clear(); return true; };

export default {
  name: 'sound', aliases: ['sfx', 'soundboard'], category: 'Fun',
  description: 'Sound board: play a funny sound effect (airhorn, drumroll, sad trombone...)',
  usage: 'sound <name>  (sound alone shows the list)', minArgs: 0,
  async run(ctx) {
    const p = config.prefix; const n = (ctx.args[0] || '').toLowerCase();
    if (!n || n === 'list') return ctx.reply('🔊 *Sound board*\n\n' + names().map((k) => `${p}sound ${k} - ${SOUNDS[k].desc}`).join('\n'));
    if (!SOUNDS[n]) return ctx.reply(`No sound called "${n.slice(0, 20)}". Type ${p}sound for the list.`);
    if (!ok(ctx.sender)) return ctx.reply('Easy there, max 6 sounds per minute 😄');
    try {
      const audio = await render(n);
      await ctx.sock.sendMessage(ctx.jid, {audio, mimetype: 'audio/ogg; codecs=opus', ptt: true}, {quoted: ctx.msg});
    } catch { await ctx.reply('Could not play that sound right now.'); }
  },
};
