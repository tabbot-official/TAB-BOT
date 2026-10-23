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

export async function xvideosSearch(query, limit = 10) {
  const { data } = await axios.get(`https://www.xvideos.com/?k=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
    timeout: 12000
  });

  const $       = cheerio.load(data);
  const results = [];

  $('.thumb-block').each((_, el) => {
    if (results.length >= limit) return false;

    const img      = $(el).find('img');
    const anchor   = $(el).find('.thumb-inside a').first();
    const titleEl  = $(el).find('a[title]').first();
    const metadata = $(el).find('.metadata').text().replace(/\s+/g, ' ').trim();

    const href     = anchor.attr('href') || '';
    const title    = titleEl.attr('title') || '';
    const thumb    = img.attr('data-src') || '';
    const preview  = img.attr('data-pvv') || '';
    const duration = $(el).find('.duration').first().text().trim();
    const quality  = $(el).find('.video-hd-mark').text().trim();

    const viewsMatch = metadata.match(/([\d.]+[KMB]?)\s*Views/i);
    const views      = viewsMatch ? viewsMatch[1] : '';

    if (!title || !href) return;

    results.push({
      title,
      url:      `https://www.xvideos.com${href}`,
      thumb,
      preview,
      duration,
      views,
      quality
    });
  });

  return results;
}
