import { fetchPublic } from '../utilities/validation.js';
import { runDownloadCommand } from '../commands/_download.js';
// Instagram and Facebook public lookups. Public profiles and pages only; private ones return a clear message. No login, no keys.
const UA = 'Mozilla/5.0 (JarvisBot)';
const n = (x) => (x == null ? '?' : Number(x).toLocaleString('en-IN'));
const user = (a) => { const u = String(a[0] || '').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0]; if (!/^[A-Za-z0-9._]{1,30}$/.test(u)) throw new Error('give a public Instagram username'); return u; };
const igCache = new Map(); // username -> {u, at}; successes kept 15 min, also used as a stale fallback when Instagram rate-limits
let igCoolUntil = 0, igStrikes = 0; // after a 429, do not hammer Instagram from this server IP for a short while
export async function igProfile(username, F = (...a) => fetch(...a), {sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now} = {}) {
  const key = username.toLowerCase(); const hit = igCache.get(key);
  if (hit && now() - hit.at < 15 * 60 * 1000) return hit.u;
  const stale = () => { if (hit) return hit.u; const m = Math.max(1, Math.ceil((igCoolUntil - now()) / 60000)); throw new Error(`Instagram is rate-limiting this server right now (HTTP 429). Not retrying for about ${m} min so the block can lift. Please try again later.`); };
  if (now() < igCoolUntil) return stale();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await F(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, { headers: { 'x-ig-app-id': '936619743392459', 'user-agent': UA }, signal: AbortSignal.timeout(12000) });
    if (r.status === 404) throw new Error('no such account');
    if (r.status === 429 || r.status >= 500) {
      if (attempt < 2 && r.status !== 429) { const ra = Number(r.headers?.get?.('retry-after')) || 0; await sleep(Math.min(8000, Math.max(1500 * attempt, ra * 1000))); continue; }
      if (r.status === 429) { igStrikes = Math.min(igStrikes + 1, 4); const ra = Number(r.headers?.get?.('retry-after')) || 0; igCoolUntil = now() + Math.max(ra * 1000, [0, 5, 15, 30, 60][igStrikes] * 60 * 1000); }
      return stale();
    }
    if (!r.ok) throw new Error(`Instagram did not answer (HTTP ${r.status}). Try again later.`);
    const u = (await r.json())?.data?.user; if (!u) throw new Error('no such account');
    igStrikes = 0; igCache.set(key, { u, at: now() }); if (igCache.size > 500) igCache.clear();
    return u;
  }
}
export async function fbPage(name, F = (...a) => fetch(...a)) {
  const r = await F(`https://www.facebook.com/${encodeURIComponent(name)}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Facebook did not answer (HTTP ${r.status})`);
  const h = await r.text(); const og = (p) => { const m = h.match(new RegExp(`property="og:${p}" content="([^"]*)"`)); return m ? m[1].replace(/&#xb7;/g, '-').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'") : null; };
  const title = og('title'); if (!title || /log in|facebook$/i.test(title) && !og('description')) throw new Error('page not public or not found');
  return { title, desc: og('description'), image: og('image') };
}
const pageName = (a) => { const u = String(a[0] || '').replace(/^https?:\/\/(www\.|m\.)?facebook\.com\//i, '').split(/[/?#]/)[0]; if (!/^[A-Za-z0-9.\-]{3,80}$/.test(u)) throw new Error('give a public page name or link'); return u; };
const mk = (name, description, usage, fn, test, extra = {}) => ({ name, category: 'Social Lookup', description, usage, aliases: [], minArgs: 1, pack: true, web: true, ownerOnly: false, group: false, image: false, tests: [test], fn: null, ...extra,
  async run(ctx) { if (!(ctx.args || []).length) return ctx.reply(`Usage: /${usage}`); try { await fn(ctx, ctx.args); } catch (e) { await ctx.reply(`Could not run ${name}: ${e.message}`); } } });
const sendPic = async (ctx, url, caption) => { const r = await fetchPublic(url, { timeoutMs: 15000, maxBytes: 8e6 + 1 }); if (!(r.status >= 200 && r.status < 300)) throw new Error('picture not available'); const b = r.body; if (b.length > 8e6) throw new Error('picture too large'); await ctx.sock.sendMessage(ctx.jid, { image: b, caption }, { quoted: ctx.msg }); };
export default [
  mk('igprofile', 'Public Instagram profile info', 'igprofile <username>', async (ctx, a) => { const u = await igProfile(user(a)); await ctx.reply(`@${u.username}${u.is_verified ? ' (verified)' : ''}\n${u.full_name || ''}\nFollowers: ${n(u.edge_followed_by?.count)}  Following: ${n(u.edge_follow?.count)}  Posts: ${n(u.edge_owner_to_timeline_media?.count)}\n${u.is_private ? 'Private account' : 'Public account'}\nBio: ${(u.biography || 'none').slice(0, 300)}`); }, ['', 'Usage']),
  mk('igdp', 'Public Instagram profile picture', 'igdp <username>', async (ctx, a) => { const u = await igProfile(user(a)); await sendPic(ctx, u.profile_pic_url_hd || u.profile_pic_url, `@${u.username}`); }, ['', 'Usage']),
  mk('igposts', 'Latest public Instagram posts (links and captions)', 'igposts <username>', async (ctx, a) => { const u = await igProfile(user(a)); if (u.is_private) return ctx.reply('That account is private.'); const e = (u.edge_owner_to_timeline_media?.edges || []).slice(0, 6); if (!e.length) return ctx.reply('No public posts found.'); await ctx.reply(e.map((x, i) => { const p = x.node; return `${i + 1}. https://www.instagram.com/${p.is_video ? 'reel' : 'p'}/${p.shortcode}/\nLikes: ${n(p.edge_liked_by?.count)}  ${(p.edge_media_to_caption?.edges?.[0]?.node?.text || '').replace(/\s+/g, ' ').slice(0, 80)}`; }).join('\n')); }, ['', 'Usage']),
  mk('igvideo', 'Download a public Instagram reel or video by link', 'igvideo <public link>', (ctx) => runDownloadCommand(ctx, { expect: 'instagram', kind: 'video', label: 'instagram' }), ['', 'Usage']),
  mk('fbpage', 'Public Facebook page info', 'fbpage <page name or link>', async (ctx, a) => { const p = await fbPage(pageName(a)); await ctx.reply(`${p.title}\n${(p.desc || '').slice(0, 300)}`); }, ['', 'Usage']),
  mk('fbdp', 'Public Facebook page picture', 'fbdp <page name or link>', async (ctx, a) => { const p = await fbPage(pageName(a)); if (!p.image) throw new Error('no picture found'); await sendPic(ctx, p.image, p.title); }, ['', 'Usage']),
];
