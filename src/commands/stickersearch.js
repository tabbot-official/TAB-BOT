// STICKERSEARCH: find a GIF on GIPHY and send it as an animated sticker.
// Needs GIPHY_API_KEY in the env (free beta key, 100 calls/hour - results cached).
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { toSticker } from '../utils/imageTools.js';
import { fetchPublic } from '../utilities/validation.js';

const cache = new Map();

export default {
  name: 'stickersearch', aliases: ['ssearch', 'gifsticker'], category: 'Media',
  description: 'Search GIFs and get one back as an animated sticker',
  usage: 'stickersearch <search text>',
  async run(ctx) {
    if (!featOn('stickersearch')) return ctx.reply('Sticker search is turned off right now.');
    const key = process.env.GIPHY_API_KEY;
    if (!key) return ctx.reply('Sticker search is not set up yet. Ask my owner to add the API key.');
    const q = ctx.args.join(' ').trim();
    if (!q) return ctx.reply('Search for what? Example: ' + config.prefix + 'stickersearch funny cat');
    try {
      const ck = q.toLowerCase();
      let list = cache.get(ck);
      if (!list || Date.now() - list.t > 3600e3) {
        const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=25&rating=pg-13`, { signal: AbortSignal.timeout(15000) });
        if (r.status === 429) return ctx.reply('⚠️ Hourly search limit reached - try again later.');
        if (!r.ok) throw new Error('API error ' + r.status);
        const j = await r.json();
        list = { t: Date.now(), urls: (j.data || []).map((g) => g.images?.fixed_height_small?.mp4 || g.images?.fixed_height?.mp4).filter(Boolean) };
        cache.set(ck, list);
        if (cache.size > 50) cache.clear();
      }
      if (!list.urls.length) return ctx.reply('No GIFs found for that.');
      const mp4 = list.urls[Math.floor(Math.random() * list.urls.length)];
      const gr = await fetchPublic(mp4, { maxBytes: 15 * 1024 * 1024, timeoutMs: 30000 });
      if (gr.status !== 200) throw new Error('GIF fetch HTTP ' + gr.status);
      const buf = gr.body;
      const webp = await toSticker(buf, { animated: true });
      await ctx.sock.sendMessage(ctx.jid, { sticker: webp }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[stickersearch] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not make that sticker right now.');
    }
  },
};
