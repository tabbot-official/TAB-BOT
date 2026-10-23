// LOGOFX: instant text logos. Pure sharp/SVG, no network.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STYLES = {
  neon: (t) => `<rect width="100%" height="100%" fill="#0a0a18"/><text x="540" y="560" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="170" fill="none" stroke="#0ff" stroke-width="4" text-anchor="middle">${esc(t)}</text><text x="540" y="560" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="170" fill="#e0ffff" text-anchor="middle" opacity="0.9">${esc(t)}</text>`,
  gold: (t) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e27a"/><stop offset="0.5" stop-color="#d4af37"/><stop offset="1" stop-color="#aa8a2e"/></linearGradient></defs><rect width="100%" height="100%" fill="#111"/><text x="540" y="560" font-family="Georgia, serif" font-weight="bold" font-size="170" fill="url(#g)" text-anchor="middle" stroke="#5c4a12" stroke-width="2">${esc(t)}</text>`,
  gradient: (t) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f6d"/><stop offset="1" stop-color="#ffc371"/></linearGradient></defs><rect width="100%" height="100%" fill="#181828"/><text x="540" y="560" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="170" fill="url(#g)" text-anchor="middle">${esc(t)}</text>`,
  minimal: (t) => `<rect width="100%" height="100%" fill="#fafafa"/><text x="540" y="560" font-family="Helvetica, Arial, sans-serif" font-weight="300" font-size="150" fill="#222" text-anchor="middle" letter-spacing="12">${esc(t)}</text><line x1="340" x2="740" y1="660" y2="660" stroke="#222" stroke-width="3"/>`,
  retro: (t) => `<rect width="100%" height="100%" fill="#2b1055"/><text x="540" y="555" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="160" fill="#ff6ad5" text-anchor="middle" transform="skewX(-8)">${esc(t)}</text><text x="540" y="565" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="160" fill="#01cdfe" text-anchor="middle" opacity="0.5" transform="skewX(-8)">${esc(t)}</text>`,
  outline: (t) => `<rect width="100%" height="100%" fill="#0f0f0f"/><text x="540" y="560" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="170" fill="none" stroke="#ffffff" stroke-width="3" text-anchor="middle">${esc(t)}</text>`,
};

export default {
  name: 'logo', aliases: ['logofx', 'makelogo'], category: 'Media',
  description: 'Make an instant logo from text (6 styles)',
  usage: 'logo <style> <text> | logo list',
  async run(ctx) {
    if (!featOn('logofx')) return ctx.reply('Logo maker is turned off right now.');
    const [style, ...rest] = ctx.args;
    if (!style || style === 'list') return ctx.reply('*Logo styles:* ' + Object.keys(STYLES).join(', ') + '\n\nUse: ' + config.prefix + 'logo <style> <text>');
    const text = rest.join(' ').trim().slice(0, 20);
    if (!text) return ctx.reply('Give me text. Example: ' + config.prefix + 'logo neon TAB');
    const make = STYLES[style.toLowerCase()];
    if (!make) return ctx.reply('Unknown style "' + style + '". Try /logo list.');
    try {
      const { default: sharp } = await import('sharp');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">${make(text.toUpperCase())}</svg>`;
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: '🎨 ' + style + ' logo' }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[logo] failed: ' + (e?.message || 'error'));
      return ctx.reply('Could not make that logo right now.');
    }
  },
};
