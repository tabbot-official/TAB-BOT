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

export async function xvideosDownload(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 12000
  });

  const $       = cheerio.load(data);
  const scripts = $('script').map((_, el) => $(el).html()).get();

  let playerScript = null;
  for (const s of scripts) {
    if (s && s.includes('setVideoUrlLow')) {
      playerScript = s;
      break;
    }
  }

  const extract = (key) => {
    if (!playerScript) return null;
    const match = playerScript.match(new RegExp(`${key}\\('([^']+)'\\)`));
    return match ? match[1] : null;
  };

  const low     = extract('setVideoUrlLow');
  const high    = extract('setVideoUrlHigh');
  const hls     = extract('setVideoHLS');
  const thumb   = extract('setThumbUrl169') || extract('setThumbUrl');

  const jsonLd = $('script[type="application/ld+json"]').first().html();
  let title = null, duration = null, views = null, uploadDate = null, thumbFallback = null;
  if (jsonLd) {
    try {
      const parsed  = JSON.parse(jsonLd);
      title         = parsed.name || null;
      thumbFallback = Array.isArray(parsed.thumbnailUrl) ? parsed.thumbnailUrl[0] : parsed.thumbnailUrl || null;
      duration      = parseDuration(parsed.duration);
      views         = parsed.interactionStatistic?.userInteractionCount || null;
      uploadDate    = parsed.uploadDate?.slice(0, 10) || null;
    } catch {}
  }

  if (!low && !high) throw new Error('No se encontraron URLs de descarga.');

  return {
    title,
    thumb:    thumb || thumbFallback,
    duration,
    views,
    uploadDate,
    download: {
      low:  low  ? { quality: '240p', url: low  } : null,
      high: high ? { quality: '360p', url: high } : null,
      hls:  hls  ? { quality: 'HLS',  url: hls  } : null
    }
  };
}
