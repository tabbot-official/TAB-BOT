// Live cricket scores without an API key: reads the match list embedded in Cricbuzz's public live-scores page.
const URL_LIVE = 'https://www.cricbuzz.com/cricket-match/live-scores';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
let cache = { at: 0, matches: null };

/** Pulls the balanced JSON array that follows `"matches":[` out of the Next.js payload. */
export function extractMatches(html) {
  const text = String(html || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const key = '"matchesList":{"matches":';
  const at = text.indexOf(key);
  if (at < 0) return [];
  let i = at + key.length; const start = i;
  if (text[i] !== '[') return [];
  let depth = 0, inStr = false, esc = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  try {
    return JSON.parse(text.slice(start, i)).map((x) => x.match).filter((m) => m?.matchInfo);
  } catch { return []; }
}

export function stateOf(info) {
  const s = String(info?.state || '').toLowerCase();
  if (s === 'complete' || s === 'abandon' || s === 'abandoned' || s === 'no result') return 'recent';
  if (s === 'preview' || s === 'upcoming' || s === 'scheduled') return 'upcoming';
  return 'live';
}

const inn = (x) => (x ? `${x.runs ?? 0}${x.wickets !== undefined && x.wickets < 10 ? '/' + x.wickets : x.wickets === 10 ? ' all out' : ''}${x.overs ? ' (' + x.overs + ' ov)' : ''}` : '');
function scoreLine(team, score) {
  const parts = [score?.inngs1, score?.inngs2, score?.inngs3, score?.inngs4].filter(Boolean).map(inn);
  return `${team.teamSName || team.teamName}${parts.length ? '  ' + parts.join(' & ') : ''}`;
}

export function formatMatch(m, now = Date.now()) {
  const i = m.matchInfo; const sc = m.matchScore || {};
  const kind = stateOf(i);
  const head = `🏏 *${i.team1.teamName} vs ${i.team2.teamName}*\n${i.seriesName} - ${i.matchDesc}${i.matchFormat ? ' (' + i.matchFormat + ')' : ''}`;
  if (kind === 'upcoming') {
    const when = i.startDate ? new Date(Number(i.startDate)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST' : '';
    return `${head}\n🗓️ ${when}\n${i.venueInfo?.ground ? '📍 ' + i.venueInfo.ground + (i.venueInfo.city ? ', ' + i.venueInfo.city : '') : ''}`.trim();
  }
  return `${head}\n${scoreLine(i.team1, sc.team1Score)}\n${scoreLine(i.team2, sc.team2Score)}\n${kind === 'live' ? '🔴 ' : '✅ '}${i.status || i.state}`;
}

// Health of the page parser: "parse_empty" means Cricbuzz changed its page layout and the extractor needs an update.
export const health = { lastOk: 0, lastError: '', parseBroken: false, failures: 0 };
const STALE_MS = 30 * 60000;
export async function fetchMatches({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache.matches && now - cache.at < 60000) return cache.matches;
  try {
    const r = await fetchImpl(URL_LIVE, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('cricket HTTP ' + r.status);
    const html = await r.text();
    const matches = extractMatches(html);
    if (!matches.length) { health.parseBroken = html.length > 20000; throw new Error('cricket parse empty'); }
    cache = { at: now, matches };
    Object.assign(health, { lastOk: now, lastError: '', parseBroken: false, failures: 0 });
    return matches;
  } catch (e) {
    health.failures++; health.lastError = String(e.message || e).slice(0, 80);
    if (cache.matches && now - cache.at < STALE_MS) return cache.matches; // serve slightly old scores rather than nothing
    throw e;
  }
}
export const _resetCache = () => { cache = { at: 0, matches: null }; };

/** mode: live | recent | upcoming | anything else = team/series filter. */
export function pick(matches, query) {
  const q = String(query || '').trim().toLowerCase();
  const modes = ['live', 'recent', 'upcoming'];
  if (!q) { const l = matches.filter((m) => stateOf(m.matchInfo) === 'live'); return { mode: l.length ? 'live' : 'recent', list: l.length ? l : matches.filter((m) => stateOf(m.matchInfo) === 'recent') }; }
  if (modes.includes(q)) return { mode: q, list: matches.filter((m) => stateOf(m.matchInfo) === q) };
  return { mode: 'search', list: matches.filter((m) => [m.matchInfo.team1.teamName, m.matchInfo.team1.teamSName, m.matchInfo.team2.teamName, m.matchInfo.team2.teamSName, m.matchInfo.seriesName].some((x) => String(x || '').toLowerCase().includes(q))) };
}
