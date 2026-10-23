import { getJson } from './limiter.js';
export async function defineWord(word, { fetchImpl = fetch } = {}) {
  const w = String(word || '').trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,40}$/.test(w)) return { error: 'BAD' };
  let j = null;
  try { j = await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), 12000, fetchImpl); }
  catch { /* fall through to Wiktionary */ }
  const e = Array.isArray(j) ? j[0] : null;
  if (!e) {
    // dictionaryapi.dev is patchy: fall back to Wiktionary (also no key).
    try {
      const r = await wiktionary(w, fetchImpl);
      return r || { error: 'NONE' };
    } catch { throw new Error('dictionary unavailable'); }
  }
  const meanings = (e.meanings || []).slice(0, 3).map((m) => {
    const d = m.definitions?.[0] || {};
    return { pos: m.partOfSpeech, def: d.definition, example: (m.definitions || []).find((x) => x.example)?.example };
  }).filter((m) => m.def);
  if (!meanings.length) return { error: 'NONE' };
  return { word: e.word || w, phonetic: e.phonetic || e.phonetics?.find((p) => p.text)?.text || '', meanings };
}
export const formatDefine = (r) => `📚 *${r.word}* ${r.phonetic}\n\n` + r.meanings.map((m, i) => `${i + 1}. _${m.pos}_ - ${m.def}${m.example ? `\n   e.g. "${m.example}"` : ''}`).join('\n\n');

const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
async function wiktionary(w, fetchImpl) {
  let j;
  try { j = await getJson('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(w), 12000, fetchImpl); }
  catch (e) { if (/404/.test(e.message)) return null; throw e; }
  const meanings = (j.en || []).slice(0, 3).map((m) => {
    const d = (m.definitions || []).find((x) => strip(x.definition)) || {};
    const ex = (m.definitions || []).flatMap((x) => x.parsedExamples || []).map((x) => strip(x.example))[0];
    return { pos: String(m.partOfSpeech || '').toLowerCase(), def: strip(d.definition), example: ex };
  }).filter((m) => m.def && m.pos !== 'symbol');
  return meanings.length ? { word: w, phonetic: '', meanings } : null;
}
