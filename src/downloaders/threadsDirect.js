// Threads post media straight from threads.com: the public post page carries the post's own JSON
// (video_versions / image_versions2 / carousel_media) when fetched with a crawler user agent.
// Used by .threads as the first source; sssthreads (src/vendor/zenbot/threads.js) is the fallback.
import axios from 'axios';

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
export const isAvatarUrl = (u) => /s150x150|\/t51\.\d+-19\//.test(String(u || ''));

export function shortcodeOf(url) {
  try { const u = new URL(url); if (!/(^|\.)threads\.(net|com)$/i.test(u.hostname)) return null; const m = /\/(?:post|t)\/([A-Za-z0-9_-]{5,})/.exec(u.pathname); return m ? m[1] : null; } catch { return null; }
}

const bestImage = (m) => { const c = m?.image_versions2?.candidates || []; return c.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0]?.url || null; };
function itemMedia(m) {
  const v = (m?.video_versions || []).find((x) => x?.url);
  if (v) return { type: 'video', url: v.url, thumb: bestImage(m) };
  const img = bestImage(m);
  return img && !isAvatarUrl(img) ? { type: 'image', url: img } : null;
}

/** Media items of the post whose code is `code`, from any parsed JSON value. */
export function mediaFromJson(root, code) {
  const stack = [root]; let seen = 0;
  while (stack.length && seen++ < 2_000_000) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (!Array.isArray(x) && x.code === code && ('media_type' in x || x.image_versions2 || x.video_versions || x.carousel_media)) {
      const items = Array.isArray(x.carousel_media) && x.carousel_media.length ? x.carousel_media.map(itemMedia).filter(Boolean) : [itemMedia(x)].filter(Boolean);
      if (items.length) return items;
    }
    for (const k in x) { const v = x[k]; if (v && typeof v === 'object') stack.push(v); }
  }
  return [];
}

export function mediaFromHtml(html, code) {
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes(`"${code}"`)) continue;
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    const items = mediaFromJson(j, code);
    if (items.length) return items;
  }
  return [];
}

export async function threadsDirect(url, { timeout = 20000 } = {}) {
  const code = shortcodeOf(url);
  if (!code) throw new Error('not a Threads post link');
  const u = new URL(url); u.hostname = 'www.threads.com'; u.search = ''; u.hash = '';
  const { data, status } = await axios.get(u.href, { headers: { 'User-Agent': BOT_UA, 'Accept-Language': 'en' }, timeout, responseType: 'text', validateStatus: () => true, maxContentLength: 8 * 1024 * 1024 });
  if (status !== 200 || typeof data !== 'string') throw new Error('threads.com answered ' + status);
  const items = mediaFromHtml(data, code);
  if (!items.length) throw new Error('no video or photo found in the post page');
  return items;
}
