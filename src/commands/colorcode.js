// COLORCODE: show a color swatch with hex, RGB and HSL.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const NAMES = { red: '#ff0000', blue: '#0000ff', green: '#00aa00', yellow: '#ffd700', orange: '#ff8c00', purple: '#8b00ff', pink: '#ff69b4', black: '#000000', white: '#ffffff', teal: '#008080', cyan: '#00ffff', magenta: '#ff00ff', brown: '#8b4513', gray: '#808080', grey: '#808080', navy: '#001f3f', maroon: '#800000', olive: '#808000', lime: '#00ff00', gold: '#ffd700', silver: '#c0c0c0', coral: '#ff7f50', salmon: '#fa8072', indigo: '#4b0082', violet: '#ee82ee', turquoise: '#40e0d0', beige: '#f5f5dc', ivory: '#fffff0', crimson: '#dc143c', lavender: '#e6e6fa' };

export default {
  name: 'colorcode', aliases: ['color', 'colour'], category: 'Tools',
  description: 'Show a color swatch with hex, RGB and HSL codes',
  usage: 'colorcode #ff8800 | colorcode red',
  async run(ctx) {
    if (!featOn('colorcode')) return ctx.reply('Color codes are turned off right now.');
    let q = (ctx.args[0] || '').toLowerCase().trim();
    if (!q) return ctx.reply('Give me a color name or hex code. Example: ' + config.prefix + 'colorcode #ff8800');
    q = NAMES[q] || q;
    const m = q.match(/^#?([0-9a-f]{6})$/);
    if (!m) return ctx.reply('Unknown color. Try a hex like #ff8800 or a common name like "teal".');
    const hex = '#' + m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
      h *= 60;
    }
    try {
      const { default: sharp } = await import('sharp');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256"><rect width="512" height="256" fill="${hex}"/><text x="256" y="140" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="bold" fill="${(r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#111' : '#fff'}" text-anchor="middle">${hex.toUpperCase()}</text></svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: `🎨 ${hex.toUpperCase()}\nRGB: ${r}, ${g}, ${b}\nHSL: ${Math.round(h)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%` }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[colorcode] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not make the swatch right now.');
    }
  },
};
