/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 * TAB BOT change: removed phDownloadBuffer (it ran a shell command and held the whole video in memory); TAB BOT remuxes the HLS stream to disk itself.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function parseDuration(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(\d+)H(\d+)M(\d+)S/);
  if (!match) return iso;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const s = parseInt(match[3]);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function extractMediaDefinitions(s) {
  const start = s.indexOf('mediaDefinitions');
  if (start === -1) return null;
  const arrStart = s.indexOf('[', start);
  if (arrStart === -1) return null;
  let depth = 0, end = -1;
  for (let i = arrStart; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  try { return JSON.parse(s.slice(arrStart, end + 1).replace(/\\\//g, '/')); }
  catch { return null; }
}

export async function phDownload(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 12000
  });

  const $       = cheerio.load(data);
  const scripts = $('script').map((_, el) => $(el).html()).get();

  let mediaDefinitions = null;
  for (const s of scripts) {
    if (!s || !s.includes('mediaDefinitions')) continue;
    mediaDefinitions = extractMediaDefinitions(s);
    if (mediaDefinitions) break;
  }

  if (!mediaDefinitions) throw new Error('No se encontraron calidades de video.');

  const hlss = mediaDefinitions
    .filter(d => d.format === 'hls' && d.videoUrl && d.quality)
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

  if (!hlss.length) throw new Error('No se encontró stream HLS.');

  const jsonLd = $('script[type="application/ld+json"]').first().html();
  let title = null, thumb = null, duration = null, uploadDate = null;
  if (jsonLd) {
    try {
      const parsed = JSON.parse(jsonLd);
      title        = parsed.name || null;
      thumb        = parsed.thumbnailUrl || null;
      duration     = parseDuration(parsed.duration);
      uploadDate   = parsed.uploadDate?.slice(0, 10) || null;
    } catch {}
  }

  if (!title) title = $('h1.title span').text().trim() || $('h1').first().text().trim() || null;

  const hls = {};
  for (const d of hlss) {
    hls[`${d.quality}p`] = { quality: `${d.quality}p`, format: 'hls', url: d.videoUrl };
  }

  return { title, thumb, duration, uploadDate, hls };
}
