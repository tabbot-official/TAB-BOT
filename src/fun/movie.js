import { getJson } from './limiter.js';
export async function findMovie(title, { key = process.env.OMDB_API_KEY, fetchImpl = fetch } = {}) {
  if (!key) return { error: 'NO_KEY' };
  const q = String(title || '').trim().slice(0, 80);
  const year = /\s(19|20)\d{2}$/.exec(q);
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&plot=short&t=${encodeURIComponent(year ? q.slice(0, -5).trim() : q)}${year ? '&y=' + year[0].trim() : ''}`;
  let j;
  try { j = await getJson(url, 12000, fetchImpl); }
  catch (e) { if (/401/.test(e.message)) return { error: 'BAD_KEY' }; throw e; }
  if (j.Response === 'False') return /key/i.test(j.Error || '') ? { error: 'BAD_KEY' } : { error: 'NONE' };
  return { movie: j };
}
export function formatMovie(m) {
  const ok = (v) => v && v !== 'N/A';
  const rt = (m.Ratings || []).find((r) => /Rotten/.test(r.Source));
  return [`🎬 *${m.Title}* (${m.Year})`, ok(m.Genre) && `🎭 ${m.Genre}`, ok(m.Runtime) && `⏱️ ${m.Runtime}`,
    ok(m.imdbRating) && `⭐ IMDb ${m.imdbRating}/10${rt ? ` · 🍅 ${rt.Value}` : ''}`, ok(m.Director) && `🎥 Director: ${m.Director}`, ok(m.Actors) && `👥 Cast: ${m.Actors}`,
    ok(m.Plot) && `\n${m.Plot}`].filter(Boolean).join('\n');
}
