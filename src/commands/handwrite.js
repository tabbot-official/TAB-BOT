// HANDWRITE: turn text into a handwriting-style note image (Kalam font, OFL).
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { ensureHandFont } from '../utils/handfont.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max) {
  const words = text.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length >= 14) break;
  }
  if (cur && lines.length < 15) lines.push(cur);
  return lines;
}

export default {
  // 'hw' alias dropped: it collided with /homework's alias, so it never resolved here.
  name: 'handwrite', aliases: ['write'], category: 'Media',
  description: 'Write your text as a handwritten note image',
  usage: 'handwrite <text>',
  async run(ctx) {
    if (!featOn('handwrite')) return ctx.reply('Handwriting notes are turned off right now.');
    const text = ctx.args.join(' ').trim() || (ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '');
    if (!text) return ctx.reply('Give me text to write. Example: ' + config.prefix + 'handwrite Meet me at 5pm');
    if (text.length > 500) return ctx.reply('Keep it under 500 characters.');
    try {
      ensureHandFont();
      const { default: sharp } = await import('sharp');
      const size = text.length > 300 ? 34 : text.length > 150 ? 40 : 48;
      const max = Math.floor(920 / (size * 0.5));
      const lines = wrap(text, max);
      const lh = size * 1.7, pad = 70, W = 1000;
      const H = pad * 2 + lines.length * lh;
      const ruled = lines.map((_, i) => `<line x1="40" x2="${W - 40}" y1="${pad + i * lh + size * 0.55}" y2="${pad + i * lh + size * 0.55}" stroke="#b8d0e8" stroke-width="1.5"/>`).join('');
      const body = lines.map((l, i) => `<text x="60" y="${pad + (i + 1) * lh - size * 0.35}" font-family="Kalam" font-size="${size}" fill="#1a3a6b">${esc(l)}</text>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fdf9ec"/><line x1="45" x2="45" y1="0" y2="${H}" stroke="#e8a0a0" stroke-width="2"/>${ruled}${body}</svg>`;
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: '📝 Your note' }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[handwrite] failed: ' + (e?.message || 'error'));
      return ctx.reply('Could not make that note right now. Try again in a moment.');
    }
  },
};
