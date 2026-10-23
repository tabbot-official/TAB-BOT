/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 */

import axios from 'axios';

const UA      = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const BASE    = 'https://sssthreads.app';

function decodeToken(token) {
  const parts = token.split('.');
  const pad   = p => p + '='.repeat((4 - p.length % 4) % 4);
  try { return JSON.parse(Buffer.from(pad(parts[0]), 'base64').toString()); }
  catch { return null; }
}

export async function threadsDownload(url) {
  if (!url.includes('threads.net') && !url.includes('threads.com'))
    throw new Error('URL inválida. Debe ser un link de Threads.');

  const form = new FormData();
  form.append('action', 'fetch_source');
  form.append('url', url);

  const { data } = await axios.post(BASE + '/', form, {
    headers: {
      'User-Agent': UA,
      'Referer':    BASE + '/',
      'Origin':     BASE,
    },
    timeout: 20000,
    validateStatus: () => true
  });

  if (!data?.success || !data?.token)
    throw new Error(data?.error || 'No se pudo obtener el contenido. Verificá que el post sea público.');

  const payload = decodeToken(data.token);
  if (!payload?.v)
    throw new Error('No se encontró contenido descargable en ese post.');

  const mediaUrl = payload.v.replace(/&amp;/g, '&');
  const thumb    = payload.t?.replace(/&amp;/g, '&') || null;
  const type     = mediaUrl.includes('.mp4') || mediaUrl.includes('/v/') ? 'video' : 'image';

  return {
    type,
    url:   mediaUrl,
    thumb,
    downloadUrl: `${BASE}/download.php?tk=${encodeURIComponent(data.token)}`,
  }
}
