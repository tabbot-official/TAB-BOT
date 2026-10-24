// Free web access for /ask: DuckDuckGo (no key) + Wikipedia fallback, page fetch, 10-minute cache.
// Everything here is best-effort and free: any failure just means "no web context", never a broken /ask.
import { fetchPublic } from '../utilities/validation.js';
import logger from '../utils/logger.js';
import { classifyFree, detectStyle } from './providers.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

/** Strong-live signal: the question clearly needs current information. (Local, zero AI quota.) */
const LIVE = /\b(news|latest|today|tonight|yesterday|tomorrow|aaj|abhi|current(ly)?|live|score|price|rates?|weather|mausam|results?|election|stock|share|sensex|nifty|release[ds]?|launch(ed)?|kab (aayega|aayegi|hoga|hai)|who won|kaun jeeta|updates?|status|breaking|traffic|gold|silver|petrol|diesel|crypto|bitcoin|ipl|match|recent(ly)?)\b|20(2[6-9]|[3-9]\d)/i;
export function needsLiveInfo(q) { return LIVE.test(String(q || '')); }

/** Strong-static signal: timeless knowledge, creative writing, coding help - web search would only add noise. */
const STATIC = /\b(kya hota hai|kya hai|matlab|meaning|definition|kaun th(a|i|e)\b|history|itihaas|capital|largest|smallest|formula|recipe|kaise ban(a|e|ate)|difference|synonym|antonym|essay|paragraph|slogan|shayari|joke|paheli|riddle|quote|motivat|story|kahani|poem|kavita|translate|anuvad|convert|calculate|kitna hota hai|square root|factorial|javascript|python|java|c\+\+|html|css|regex|sql|array|function|code|error|exception|photosynthesis|gravity|newton|einstein)\b/i;

const CLS_PROMPT = 'You decide whether answering the question needs CURRENT or live web information (news, prices, scores, weather, recent events, availability, schedules). Reply with exactly YES or NO.';
const clsCache = new Map();
/** Free classifier via the bot's keyless/free providers (never Gemini quota). Returns true/false, or null when unsure. */
async function classifyLive(question) {
  const key = String(question).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  const hit = clsCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.v;
  let v = null;
  const t = String(await classifyFree(CLS_PROMPT, key) || '').trim().toUpperCase();
  if (t.startsWith('YES')) v = true; else if (t.startsWith('NO')) v = false;
  clsCache.set(key, { at: Date.now(), v });
  if (clsCache.size > 300) clsCache.delete(clsCache.keys().next().value);
  return v;
}

/**
 * The bot decides itself whether a question needs the web:
 * strong-live heuristic -> search; strong-static -> no search; otherwise a free no-key classifier decides.
 * Classifier failure defaults to no search (the post-answer hedge retry in ask.js still catches misses).
 */
export async function decideSearch(q) {
  const s = String(q || '');
  if (needsLiveInfo(s)) return { search: true, via: 'gate' };
  if (STATIC.test(s)) return { search: false, via: 'gate' };
  const c = await classifyLive(s);
  return { search: c === true, via: c === null ? 'default' : 'classifier' };
}

export function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** DuckDuckGo redirect links carry the real URL in uddg=; decode it. */
function realUrl(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const wrapped = u.searchParams.get('uddg');
    const out = wrapped ? new URL(decodeURIComponent(wrapped)) : u;
    if (!/^https?:$/.test(out.protocol) || /(^|\.)duckduckgo\.com$/i.test(out.hostname)) return null;
    return out.toString();
  } catch { return null; }
}

async function fetchText(url, ms = 12000) {
  const res = await fetchPublic(url, { timeoutMs: ms, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`HTTP ${res.status}`);
  return res.body.toString('utf8');
}

function parseDdg(html, limit) {
  const out = [];
  const blocks = html.split(/<a[^>]+class="[^"]*result-link[^"]*"|<a[^>]+class="[^"]*result__a[^"]*"/i).slice(1);
  for (const b of blocks) {
    const m = b.match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const url = realUrl(m[1].replace(/&amp;/g, '&'));
    if (!url) continue;
    const title = stripTags(m[2]).slice(0, 120);
    const sn = b.match(/class="[^"]*(?:result-snippet|result__snippet)[^"]*"[^>]*>([\s\S]*?)<\/(?:td|a|div)>/i);
    const snippet = stripTags(sn ? sn[1] : '').slice(0, 300);
    if (title && !out.some((r) => r.url === url)) out.push({ title, url, snippet });
    if (out.length >= limit) break;
  }
  return out;
}

async function ddgFrom(host, query, limit) {
  const html = await fetchText(`${host}?q=${encodeURIComponent(query)}`);
  const r = parseDdg(html, limit);
  if (!r.length) throw new Error('no results');
  return r;
}

/** Bing HTML results; decodes the /ck/a redirect wrapper (u= is base64url after an 'a1' prefix). */
async function bing(query, limit) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
  const out = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const m = block.match(/<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    let url = null;
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      const enc = u.searchParams.get('u');
      url = /(^|\.)bing\.com$/i.test(u.hostname) && enc && enc.startsWith('a1') ? Buffer.from(enc.slice(2), 'base64url').toString('utf8') : u.toString();
      if (!/^https:\/\//.test(url) || /(^|\.)bing\.com/i.test(new URL(url).hostname)) continue;
    } catch { continue; }
    const title = stripTags(m[2]).slice(0, 120);
    if (!title) continue;
    const sn = block.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title, url, snippet: stripTags(sn ? sn[1] : '').slice(0, 300) });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('no results');
  return out;
}

async function wikipedia(query, limit) {
  try {
    const u = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=${limit}&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const j = JSON.parse(await fetchText(u));
    return (j?.query?.search || []).map((x) => ({ title: stripTags(x.title), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`, snippet: stripTags(x.snippet) }));
  } catch (e) { logger.warn(`[web] wikipedia failed: ${e.message}`); return []; }
}

/** All free engines, queried in parallel and merged. A slow or blocked engine just contributes nothing. */
export const ENGINES = {
  'ddg-lite': (q, l) => ddgFrom('https://lite.duckduckgo.com/lite/', q, l),
  'ddg-html': (q, l) => ddgFrom('https://html.duckduckgo.com/html/', q, l),
  bing,
  wikipedia,
};

function normKey(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).toLowerCase().replace(/\/+$/, '');
  } catch { return String(url); }
}

/** Free web search: every engine in parallel, merged + deduped with reciprocal-rank fusion. Cached 10 min. */
export async function searchWeb(query, { limit = 5 } = {}) {
  const key = String(query).toLowerCase().replace(/\s+/g, ' ').trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const names = Object.keys(ENGINES);
  const settled = await Promise.allSettled(names.map((n) => ENGINES[n](key, 5)));
  const fused = new Map();
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled') { logger.warn(`[web] ${names[i]}: ${s.reason?.message || 'failed'}`); return; }
    if (!s.value.length) return;
    logger.info(`[web] ${names[i]}: ${s.value.length} hits`);
    s.value.forEach((r, rank) => {
      const k = normKey(r.url);
      const cur = fused.get(k) || { score: 0, result: r };
      cur.score += 1 / (60 + rank + 1);
      if (!cur.result.snippet && r.snippet) cur.result = r;
      fused.set(k, cur);
    });
  });
  const results = [...fused.values()].sort((a, b) => b.score - a.score).map((x) => x.result).slice(0, limit);
  cache.set(key, { at: Date.now(), results });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return results;
}

/** Fetches a page and returns readable text (first maxChars). Null on any failure. */
export async function fetchPageText(url, { maxChars = 2200 } = {}) {
  try {
    const html = await fetchText(url);
    const body = html.match(/<body[\s\S]*$/i);
    return stripTags(body ? body[0] : html).slice(0, maxChars) || null;
  } catch { return null; }
}

/** Domain + trimmed path, for compact WhatsApp source lines. */
export function shortUrl(url) {
  try {
    const u = new URL(url);
    const p = (u.pathname + u.search).replace(/\/$/, '');
    return u.hostname.replace(/^www\./, '') + (p.length > 45 ? p.slice(0, 45) + '…' : p);
  } catch { return String(url).slice(0, 60); }
}

const QR_PROMPT = 'Rewrite the user text as a short English web search query (3-8 words). Translate Hindi/Hinglish to English. Add India when the topic is India-related. Reply with the query only: plain words, no quotes, no punctuation.';
const qrCache = new Map();
/** Hinglish/Hindi questions become a clean English search query via the free classifier call (cached 1h); English passes through. */
const HINGLISH_STOP = new Set(['ka', 'ki', 'ke', 'kya', 'hai', 'hain', 'ho', 'batao', 'bata', 'bataye', 'dijiye', 'mujhe', 'mera', 'meri', 'kitna', 'kitne', 'kitni', 'tum', 'aap', 'please', 'plz', 'pls', 'toh', 'bhi', 'mein', 'me', 'se', 'par', 'liye', 'wala', 'wali', 'ye', 'yeh', 'woh', 'hota', 'hogi', 'hoga', 'tha', 'thi', 'kab', 'bt', 'kaisa', 'kaisi', 'kaise']);
const GLOSSARY = { mausam: 'weather', sone: 'gold', sona: 'gold', chandi: 'silver', bhav: 'rate', bhaav: 'rate', daam: 'price', khabar: 'news', khabrein: 'news', nateeja: 'result', nataija: 'result', jeeta: 'won', aaj: 'today', kal: 'tomorrow', abhi: 'today', naya: 'new', nayi: 'new', sarkar: 'government', chunav: 'election', mandi: 'market', share: 'share market' };
const INDIA_WORDS = new Set(['gold', 'silver', 'petrol', 'diesel', 'sensex', 'nifty', 'rupee', 'rs', 'share', 'market', 'rate', 'price']);
/** Deterministic fallback when the AI rewrite is unavailable: drop Hindi stopwords, translate common words, add India for India-priced things. */
function localRewrite(q) {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  let changed = false;
  for (const w of words) {
    if (HINGLISH_STOP.has(w)) { changed = true; continue; }
    if (GLOSSARY[w]) { out.push(GLOSSARY[w]); changed = true; } else out.push(w);
  }
  if (!changed || out.length < 2) return q;
  if (out.some((w) => INDIA_WORDS.has(w)) && !out.includes('india')) out.push('india');
  return out.join(' ');
}

export async function toSearchQuery(q) {
  const question = String(q || '').trim();
  const style = detectStyle(question);
  if (style === 'English' && localRewrite(question) === question) return question;
  const key = question.toLowerCase();
  const hit = qrCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.v;
  let v = localRewrite(question);
  const t = String(await classifyFree(QR_PROMPT, question) || '').trim().replace(/^["']|["']$/g, '').replace(/['’\u2018\u2019]/g, '').replace(/\s+/g, ' ');
  if (t && t.split(/\s+/).length <= 12 && !/\?/.test(t)) v = t;
  qrCache.set(key, { at: Date.now(), v });
  if (qrCache.size > 300) qrCache.delete(qrCache.keys().next().value);
  if (v !== question) logger.info(`[web] query rewritten: "${question}" -> "${v}"`);
  return v;
}

/**
 * Search + read top pages. Returns { contextText, sources } or null when the web has nothing usable.
 * contextText is ready to append to the AI question; sources are the top results for the reply footer.
 */
export async function webContext(query, { limit = 3 } = {}) {
  query = await toSearchQuery(query);
  const results = await searchWeb(query, { limit: 5 });
  if (!results.length) return null;
  const top = results.slice(0, limit);
  const pages = await Promise.all(top.slice(0, 2).map((r) => fetchPageText(r.url)));
  const parts = top.map((r, i) => {
    let s = `[${i + 1}] ${r.title} - ${r.url}\n${r.snippet || ''}`;
    if (pages[i]) s += `\nPage excerpt: ${pages[i].slice(0, 1200)}`;
    return s;
  });
  const contextText = `Fresh web results for "${query}" (fetched just now):\n${parts.join('\n\n')}\n\nRules for using these results: base current facts (news, prices, scores, weather, dates) on them, NOT on your memory; mention the source naturally (e.g. "AccuWeather ke mutabik"); if sources disagree, say so and give both; if none of them answer the question, honestly say "pakka nahi pata" instead of guessing.`;
  return { contextText: contextText.slice(0, 5000), sources: top };
}
