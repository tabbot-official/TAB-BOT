import config from '../config/config.js';
import { makeRate } from '../fun/limiter.js';
import { createJobDir, removeJobDir } from '../utils/fileManager.js';
import { REACTIONS, reactionList, resolveReaction, fetchReactionGif, downloadGif, gifToMp4, buildCaption } from '../fun/reactions.js';

const rate = makeRate(6);
const NAMES = reactionList();

function targetFrom(ctx) {
  const msg = ctx.msg?.message || {};
  const info = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || msg.videoMessage?.contextInfo || null;
  const mentioned = info?.mentionedJid?.[0];
  if (mentioned) return mentioned;
  const quoted = info?.participant;
  if (quoted && typeof quoted === 'string' && quoted.includes('@')) return quoted;
  return null;
}

export default {
  // 'hug' and 'highfive' keep their original text pack commands (src/packs/fun.js), so they are not aliases here.
  name: 'react', aliases: ['reactions', ...NAMES.filter((n) => n !== 'hug' && n !== 'highfive')], category: 'Games',
  description: 'Anime reaction GIFs: ' + NAMES.join(', ') + ' (optionally @someone)',
  usage: 'react <' + NAMES.join('|') + '> [@user]  - or use the reaction name directly, e.g. pat @user',
  async run(ctx) {
    const invoked = ctx.commandName === 'react' || ctx.commandName === 'reactions' ? String(ctx.args[0] || '').toLowerCase() : ctx.commandName;
    const type = resolveReaction(invoked);
    if (!type) {
      return ctx.reply('🎭 *Reactions* (' + NAMES.length + ')\n' + NAMES.map((n) => config.prefix + n).join(', ') + '\nAdd @someone (or reply to their message) to aim it at them.');
    }
    if (!rate(ctx.sender)) return ctx.reply('Slow down - max 6 reactions per minute.');
    let gif;
    try {
      const pick = await fetchReactionGif(type);
      gif = await downloadGif(pick.url);
    } catch {
      return ctx.reply('The reaction service is busy. Try again in a minute.');
    }
    const workDir = await createJobDir();
    try {
      const mp4 = await gifToMp4(gif, { workDir, ffmpeg: config.tools.ffmpeg });
      const target = targetFrom(ctx);
      const { caption, mentions } = buildCaption(type, ctx.sender, target);
      await ctx.sock.sendMessage(ctx.jid, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption, mentions }, { quoted: ctx.msg });
    } catch {
      await ctx.reply('Could not prepare that reaction GIF. Try another one.');
    } finally {
      await removeJobDir(workDir);
    }
  },
};
