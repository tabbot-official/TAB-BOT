import {downloadMediaMessage} from '@whiskeysockets/baileys';
import sharp from 'sharp';
import jsQR from 'jsqr';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia, quotedMediaMissing, MISSING_MEDIA_HINT} from '../utils/imageTools.js';
import {check, extractUrl} from '../linksafe/index.js';
async function qrFrom(ctx) {
  const media = findMedia(ctx.msg);
  if (!media || media.type !== 'image' || media.animated) return null;
  if (Number(media.node.fileLength) > 8 * 1048576) return null;
  const buf = await downloadMediaMessage(media.message, 'buffer', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage});
  const {data, info} = await sharp(buf, {limitInputPixels: 16e6}).rotate().resize(1000, 1000, {fit: 'inside', withoutEnlargement: true}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const r = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return r?.data || null;
}
export default {
  name: 'linkcheck', aliases: ['safelink', 'scanlink', 'qrcheck'], category: 'Tools', requiredLevel: 'user',
  description: 'Check a link or QR photo for scams and phishing', usage: 'linkcheck <link>  (or reply to a QR photo)', minArgs: 0,
  async run(ctx) {
    try {
      let target = extractUrl(ctx.args.join(' '));
      let fromQr = false;
      if (!target) {
        const q = await qrFrom(ctx).catch(() => null);
        if (q) { fromQr = true; target = extractUrl(q) || (q.startsWith('http') ? q : null); if (!target) return ctx.reply('QR found, but it is not a web link:\n' + q.slice(0, 300)); }
      }
      if (!target && quotedMediaMissing(ctx.msg)) return ctx.reply(MISSING_MEDIA_HINT);
      if (!target) { const quoted = ctx.quotedText || ctx.quoted?.text; target = extractUrl(quoted); }
      if (!target) return ctx.reply(`Send a link: ${config.prefix}linkcheck <link>\nOr reply to a QR photo / a message with a link.`);
      const r = await check(target);
      const icon = r.verdict === 'DANGEROUS' ? '🚨' : r.verdict === 'SUSPICIOUS' ? '⚠️' : '✅';
      const lines = [`${icon} *${r.verdict}*${fromQr ? ' (from QR)' : ''}`, target.slice(0, 200)];
      if (r.final) lines.push(`Redirects to: ${r.final.slice(0, 200)}`);
      if (r.flags.length) lines.push('', ...r.flags.map((f) => '• ' + f));
      else lines.push('', 'No warning signs found.');
      lines.push('', '_Automatic check only. When in doubt, do not open it or enter OTP/passwords._');
      await ctx.reply(lines.join('\n'));
    } catch (e) { logger.warn('linkcheck error: ' + (e?.message || 'error')); await ctx.reply('Could not check that link. Try again.'); }
  },
};
