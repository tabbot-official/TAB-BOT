/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 * TAB BOT change: removed xhamsterDownloadBuffer (whole video in memory); prefer the h264 HLS master over AV1 and also return direct h264 .mp4 links as `direct`.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';


const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function secsToTime(s) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const XH_UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export async function xhamsterDownload(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 12000
  });

  const $       = cheerio.load(data);
  const scripts = $('script').map((_, el) => $(el).html()).get();

  let title = null, thumb = null, duration = null, views = null;

  for (const s of scripts) {
    if (!s || !s.includes('"title"') || !s.includes('"duration"')) continue;
    try {
      const match = s.match(/"title":"([^"]+)","thumbUrl":"([^"]+)","duration":(\d+),"views":(\d+)/);
      if (match) {
        title    = match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        thumb    = match[2].replace(/\\\//g, '/');
        duration = secsToTime(parseInt(match[3]));
        views    = parseInt(match[4]);
        break;
      }
    } catch {}
  }

  if (!title) title = $('meta[property="og:title"]').attr('content') || null;
  if (!thumb) thumb = $('meta[property="og:image"]').attr('content') || null;

  const flat       = data.replace(/\\\//g, '/');
  const mp4Matches = [...new Set(flat.match(/https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g) || [])].filter(u => !/thumb-v\d*\.xhcdn/.test(u));
  const masterUrl  = mp4Matches.find(u => (u.includes('480p') || u.includes('hls4')) && !u.includes('.av1.'))
                  || mp4Matches.find(u => u.includes('480p') || u.includes('hls4'));
  // TAB BOT: direct progressive h264 files (play on every phone, no HLS remux needed)
  const direct = {};
  for (const u of mp4Matches) {
    const m = u.match(/\/(\d{3,4}p)\.h264\.mp4(?:$|\?)/);
    if (m && !direct[m[1]]) direct[m[1]] = { quality: m[1], url: u, format: 'mp4' };
  }

  if (!masterUrl && !Object.keys(direct).length) throw new Error('No se encontró stream de video.');
  if (!masterUrl) return { title, thumb, duration, views, download: {}, direct };

  const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

  const { data: m3u8 } = await axios.get(masterUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://xhamster.com/' },
    timeout: 10000
  });

  const download = {};
  const lines    = m3u8.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && resMatch) {
        const qualMatch = nextLine.match(/(\d+p)/);
        const quality   = qualMatch ? qualMatch[1] : resMatch[1];
        const streamUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
        download[quality] = { quality, url: streamUrl, format: 'hls' };
      }
    }
  }

  if (!Object.keys(download).length && !Object.keys(direct).length) throw new Error('No se encontraron calidades.');

  return { title, thumb, duration, views, download, direct };
}
