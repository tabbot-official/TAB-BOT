/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export async function xhamsterSearch(query, limit = 10) {
  const { data } = await axios.get(`https://xhamster.com/search/${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
    timeout: 12000
  });

  const $       = cheerio.load(data);
  const results = [];

  $('[class*="video-thumb"]').each((_, el) => {
    if (results.length >= limit) return false;

    const anchor   = $(el).find('a.thumb-image-container').first();
    const img      = $(el).find('img').first();

    const title    = anchor.attr('aria-label') || $(el).find('[class*="name"]').first().text().trim();
    const href     = anchor.attr('href') || '';
    const thumb    = img.attr('src') || img.attr('srcset')?.split(' ')[0] || '';
    const preview  = anchor.attr('data-previewvideo') || '';
    const duration = $(el).find('time').first().attr('datetime') || '';
    const views    = $(el).find('[class*="views"]').first().text().trim();

    if (!title || !href) return;

    results.push({ title, url: href, thumb, preview, duration, views });
  });

  return results;
}
