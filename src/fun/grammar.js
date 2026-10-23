export function applyFixes(text, matches) {
  let out = text;
  for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
    const rep = m.replacements?.[0]?.value; if (rep == null) continue;
    out = out.slice(0, m.offset) + rep + out.slice(m.offset + m.length);
  }
  return out;
}
export async function checkGrammar(text, { fetchImpl = fetch } = {}) {
  const t = String(text || '').trim().slice(0, 1500);
  const r = await fetchImpl('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ text: t, language: 'auto', preferredVariants: 'en-US' }), signal: AbortSignal.timeout(15000) });
  if (r.status === 429) return { error: 'LIMIT' };
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const matches = (j.matches || []).filter((m) => m.replacements?.length);
  return { lang: j.language?.name || '', original: t, fixed: applyFixes(t, matches), issues: matches.slice(0, 5).map((m) => ({ msg: m.shortMessage || m.message, bad: t.slice(m.offset, m.offset + m.length), good: m.replacements[0].value })), count: matches.length };
}
export function formatGrammar(r) {
  if (!r.count) return '✅ No mistakes found.';
  return `✍️ *Corrected* (${r.count} fix${r.count > 1 ? 'es' : ''}${r.lang ? ', ' + r.lang : ''})\n${r.fixed}\n\n` + r.issues.map((i) => `• "${i.bad}" → "${i.good}"${i.msg ? ` (${i.msg})` : ''}`).join('\n');
}
