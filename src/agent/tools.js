// Tab: tools the .agent planner can call for EVERYONE (safe mode), each with its own per-user hourly limit.
//   search  - free web search (DuckDuckGo lite/html + Bing + Wikipedia, merged; src/ai/websearch.js)
//   read    - read one public web page (SSRF-guarded fetchPublic: public IPs only, ports 80/443, redirects re-checked)
//   image   - generate an image (the existing .imagine command, its own limits and providers)
//   song / video / spotify - download and send media (the existing .play / .video / .spotify commands, which already go
//             through the sender with its size and RAM gates)
// The owner is never limited. Limits: AGENT_TOOL_LIMITS="search=10,read=10,image=4,song=5,video=3,spotify=5" (per hour).
import { searchWeb, stripTags, shortUrl } from '../ai/websearch.js';
import { fetchPublic } from '../utilities/validation.js';

export const TOOLS = {
  search: { limit: 10, label: 'web search', arg: 'q' },
  read: { limit: 10, label: 'read a web page', arg: 'url' },
  image: { limit: 4, label: 'image generation', arg: 'prompt', cmd: 'imagine' },
  song: { limit: 5, label: 'song download', arg: 'q', cmd: 'play' },
  video: { limit: 3, label: 'video download', arg: 'q', cmd: 'video' },
  spotify: { limit: 5, label: 'Spotify download', arg: 'q', cmd: 'spotify' },
};
export const MEDIA_TOOLS = ['image', 'song', 'video', 'spotify'];
const MAX_ARG = { q: 200, prompt: 300, url: 500 };

export function toolLimits(env = process.env) {
  const out = Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, v.limit]));
  for (const part of String(env.AGENT_TOOL_LIMITS || '').split(',')) {
    const m = /^\s*([a-z]+)\s*=\s*(\d{1,4})\s*$/i.exec(part);
    if (m && out[m[1].toLowerCase()] !== undefined) out[m[1].toLowerCase()] = Number(m[2]);
  }
  return out;
}

// Sliding one-hour window per user per tool. Bounded: the map is pruned when it grows large.
const used = new Map(); // `${user}|${tool}` -> [timestamps]
export function resetToolLimits() { used.clear(); }
/** Returns { ok, left, retryMin }. Counts the use only when ok. */
export function takeTool(user, tool, { isOwner = false, now = Date.now(), env = process.env } = {}) {
  if (isOwner) return { ok: true, left: Infinity, retryMin: 0 };
  const limit = toolLimits(env)[tool] ?? 0;
  const k = String(user || '?') + '|' + tool;
  const list = (used.get(k) || []).filter((t) => now - t < 3600e3);
  if (list.length >= limit) {
    used.set(k, list);
    const retryMin = list.length ? Math.max(1, Math.ceil((list[0] + 3600e3 - now) / 60e3)) : 60;
    return { ok: false, left: 0, retryMin };
  }
  list.push(now); used.set(k, list);
  if (used.size > 5000) for (const [kk, v] of used) { if (!v.some((t) => now - t < 3600e3)) used.delete(kk); }
  return { ok: true, left: limit - list.length, retryMin: 0 };
}

/** Validate one planner tool step: {"tool":"search","q":"..."} -> {type:'tool', tool, arg} or null. */
// Accepts {"search":"query"} (the shape the planners are asked for: models like gpt-oss treat the word "tool" in a
// prompt as a function-calling request and return no text) and the longer {"tool":"search","q":"query"}.
export function parseToolStep(s) {
  if (!s || typeof s !== 'object') return null;
  let tool = String(s.tool || '').toLowerCase().replace(/[^a-z]/g, '');
  let short = null;
  if (!tool) {
    const keys = Object.keys(s).filter((k) => TOOLS[k.toLowerCase()]);
    if (keys.length !== 1 || typeof s[keys[0]] !== 'string') return null;
    tool = keys[0].toLowerCase(); short = s[keys[0]];
  }
  const def = TOOLS[tool];
  if (!def) return null;
  const raw = short ?? s[def.arg] ?? s.args ?? s.q ?? s.query ?? s.url ?? s.prompt ?? '';
  const arg = String(raw).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_ARG[def.arg]);
  if (!arg) return null;
  // read takes a public URL, or "result:N" = the Nth result of the previous search step.
  if (tool === 'read' && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(arg) && !/^result:[1-9]$/i.test(arg)) return null;
  return { type: 'tool', tool, arg };
}

/** Free web search -> compact text block for the summary, plus the raw results. */
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'who', 'how', 'when', 'where', 'why', 'latest', 'new', 'news', 'today', 'about', 'from', 'that', 'this', 'are', 'was', 'is']);
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
/** Drop results that share no meaningful word with the query (engines sometimes return unrelated pages). */
export function relevant(results, q) {
  const want = new Set(words(q).filter((w) => !STOP.has(w)));
  if (!want.size) return results;
  const kept = results.filter((r) => words(r.title + ' ' + r.snippet + ' ' + r.url).some((w) => want.has(w)));
  return kept.length ? kept : results;
}
export async function runSearch(q, { limit = 5, search = searchWeb } = {}) {
  const results = relevant((await search(q, { limit: limit + 2 })) || [], q).slice(0, limit);
  if (!results.length) return { ok: false, text: 'No web results for "' + q + '".', results: [] };
  const text = results.map((r, i) => `${i + 1}. ${String(r.title || '').slice(0, 120)} (${shortUrl(r.url)})${r.snippet ? '\n   ' + String(r.snippet).slice(0, 300) : ''}`).join('\n');
  return { ok: true, text, results };
}

const READ_MAX_BYTES = 1_500_000;
/** Read one public page through the SSRF guard. Text capped at maxChars. */
export async function readUrl(url, { maxChars = 4000, fetcher = fetchPublic } = {}) {
  let res;
  try {
    res = await fetcher(url, { maxBytes: READ_MAX_BYTES, timeoutMs: 15000, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' } });
  } catch (e) {
    const m = String(e?.message || e);
    return { ok: false, text: /not allowed|Only public|Invalid URL|blocked/i.test(m) ? 'That address is not allowed (only public web pages).' : /too large/i.test(m) ? 'That page is too large to read (over 1.5 MB).' : 'Could not open that page (' + m.slice(0, 80) + ').' };
  }
  if (!(res.status >= 200 && res.status < 300)) return { ok: false, text: 'The page answered HTTP ' + res.status + '.' };
  const type = String(res.headers?.['content-type'] || '').toLowerCase();
  const raw = res.body.toString('utf8', 0, Math.min(res.body.length, 600_000)); // bound the regex work
  let title = '', text = '';
  if (/html|xml/.test(type) || (!type && /<html|<body/i.test(raw))) {
    title = stripTags((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw) || [])[1] || '').slice(0, 150);
    const body = raw.replace(/<(nav|header|footer|aside|noscript|svg|form)[\s\S]*?<\/\1>/gi, ' ');
    text = stripTags((body.match(/<body[\s\S]*$/i) || [body])[0]);
  } else if (/^text\/|json/.test(type)) {
    text = raw.replace(/\s+/g, ' ').trim();
  } else {
    return { ok: false, text: 'That link is a ' + (type.split(';')[0] || 'binary') + ' file, not a page I can read.' };
  }
  if (!text) return { ok: false, text: 'That page has no readable text.' };
  const cut = text.length > maxChars;
  return { ok: true, title, finalUrl: res.finalUrl || url, text: text.slice(0, maxChars) + (cut ? ' …' : '') };
}
