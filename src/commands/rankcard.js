// RANKCARD: a clean rank card for the group XP system (5 xp per active minute).
import { fetchPublic } from '../utilities/validation.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { xpOf, levelOf, nextLevelXp, rankOf, totalMembers } from '../fun/rank.js';

export default {
  name: 'rankcard', aliases: ['rank', 'level'], category: 'Group',
  description: 'Your group rank card (XP from being active)',
  usage: 'rankcard [@user]',
  async run(ctx) {
    if (!featOn('rankcard')) return ctx.reply('Rank cards are turned off right now.');
    if (!ctx.isGroup) return ctx.reply('Rank cards only work in groups.');
    const target = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      || ctx.msg.message?.extendedTextMessage?.contextInfo?.participant
      || ctx.senderJid || ctx.sender;
    const user = (target || '').split('@')[0].split(':')[0];
    const xp = xpOf(ctx.jid, user);
    const level = levelOf(xp);
    const need = nextLevelXp(level);
    const rank = rankOf(ctx.jid, user);
    const total = Math.max(totalMembers(ctx.jid), 1);
    const pct = Math.min(100, Math.round((xp / need) * 100));
    const name = (ctx.msg.pushName || user).slice(0, 18).replace(/[<>&]/g, '');
    try {
      const { default: sharp } = await import('sharp');
      let avatar = `<circle cx="90" cy="110" r="55" fill="#3b3b55"/><text x="90" y="128" font-family="Helvetica, Arial, sans-serif" font-size="52" fill="#bbb" text-anchor="middle">${(name[0] || '?').toUpperCase()}</text>`;
      const purl = await ctx.sock.profilePictureUrl(target, 'image').catch(() => null);
      if (purl) {
        const pr = await fetchPublic(purl, { maxBytes: 8 * 1024 * 1024, timeoutMs: 10000 });
        if (pr.status !== 200) throw new Error('avatar HTTP ' + pr.status);
        const buf = pr.body;
        const round = await sharp(buf).resize(110, 110).composite([{ input: Buffer.from('<svg><circle cx="55" cy="55" r="55"/></svg>'), blend: 'dest-in' }]).png().toBuffer();
        avatar = `<image href="data:image/png;base64,${round.toString('base64')}" x="35" y="55" width="110" height="110"/>`;
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="220">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1a2e"/><stop offset="1" stop-color="#16213e"/></linearGradient><linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00c6ff"/><stop offset="1" stop-color="#0072ff"/></linearGradient></defs>
<rect width="700" height="220" rx="24" fill="url(#bg)"/>
${avatar}
<text x="170" y="80" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="bold" fill="#fff">${name}</text>
<text x="170" y="115" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#9fb3c8">Level ${level} · Rank #${rank} of ${total}</text>
<rect x="170" y="140" width="480" height="22" rx="11" fill="#2a2a44"/>
<rect x="170" y="140" width="${Math.max(11, 4.8 * pct)}" height="22" rx="11" fill="url(#bar)"/>
<text x="170" y="190" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#9fb3c8">${xp} / ${need} XP (${pct}%)</text>
</svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: '🏅 Rank card' }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[rankcard] failed: ' + (e?.message || 'error'));
      return ctx.reply(`🏅 ${name}: Level ${level}, ${xp} XP, rank #${rank} of ${total}.`);
    }
  },
};
