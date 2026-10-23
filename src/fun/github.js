const API = 'https://api.github.com';
export class GhError extends Error { constructor(code, msg, extra = {}) { super(msg); this.code = code; Object.assign(this, extra); } }
export function parseTarget(input) {
  const s = String(input || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?:\/([A-Za-z0-9._-]{1,100}))?(?:\/.*)?$/.exec(s);
  return m ? { owner: m[1], repo: m[2] || null } : null;
}
const cache = new Map();
async function gh(pathname, { fetchImpl = fetch, now = Date.now(), token = process.env.GITHUB_TOKEN } = {}) {
  const c = cache.get(pathname); if (c && now - c.t < 300000) return c.j;
  const headers = { 'user-agent': 'JarvisBot/1.0', accept: 'application/vnd.github+json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetchImpl(API + pathname, { headers, signal: AbortSignal.timeout(12000) });
  if (r.status === 404) throw new GhError('NONE', 'not found');
  if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000;
    throw new GhError('LIMIT', 'rate limited', { reset });
  }
  if (!r.ok) throw new GhError('HTTP', 'HTTP ' + r.status);
  const j = await r.json();
  if (cache.size > 100) cache.clear();
  cache.set(pathname, { t: now, j });
  return j;
}
export const lookup = (t, o) => (t.repo ? gh(`/repos/${t.owner}/${t.repo}`, o) : gh(`/users/${t.owner}`, o));
const d = (s) => (s ? String(s).slice(0, 10) : '-');
export function formatRepo(r) {
  return [`💻 *${r.full_name}*`, r.description && r.description, `⭐ ${r.stargazers_count}  🍴 ${r.forks_count}  👀 ${r.subscribers_count ?? r.watchers_count}  🐞 ${r.open_issues_count} issues`,
    `🗣️ ${r.language || 'n/a'}${r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? ' · ' + r.license.spdx_id : ''}`, `📅 Updated ${d(r.pushed_at)}${r.archived ? ' · archived' : ''}`, r.html_url].filter(Boolean).join('\n');
}
export function formatUser(u) {
  return [`👤 *${u.name || u.login}* (@${u.login})${u.type === 'Organization' ? ' · org' : ''}`, u.bio && u.bio, `📦 ${u.public_repos} repos  👥 ${u.followers} followers  ➡️ ${u.following} following`,
    u.location && `📍 ${u.location}`, `📅 Joined ${d(u.created_at)}`, u.html_url].filter(Boolean).join('\n');
}
export const _clear = () => cache.clear();
