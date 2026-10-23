// Pre-verified command templates: install WITHOUT LLM codegen. Each template's
// body was hand-tested. External free APIs used here can still fail at runtime.
export const TEMPLATES = {
  qr: {
    match: /\bqr\b/i,
    desc: 'Make a QR code for any text or link',
    usage: '<text or link>',
    body: `const data = ctx.args.join(' ').trim();
if (!data) { await ctx.reply('Usage: /CMDNAME <text or link>'); return; }
try {
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(data);
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('QR service returned HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  await ctx.sock.sendMessage(ctx.jid, { image: buf, caption: 'QR for: ' + data.slice(0, 80) }, { quoted: ctx.msg });
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  counter: {
    match: /\bcounter\b|\bcount(er|ing)?\s*command\b/i,
    desc: 'Count how many times the command is used',
    usage: '(no input)',
    minArgs: 0,
    body: `try {
  const fsx = await import('node:fs');
  const f = 'data/counter-CMDNAME.json';
  let n = 0;
  try { n = JSON.parse(fsx.readFileSync(f, 'utf8')).n || 0; } catch {}
  n++;
  fsx.mkdirSync('data', { recursive: true });
  fsx.writeFileSync(f, JSON.stringify({ n }));
  await ctx.reply('This command has been used ' + n + ' time(s).');
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  jsonapi: {
    match: /\bjson\b|\bapi\b.*\bfetch\b|\bfetch\b.*\bapi\b/i,
    desc: 'Fetch a public JSON API URL and show a formatted excerpt',
    usage: '<https URL>',
    body: `const url = ctx.args[0] || '';
if (!/^https:\\/\\//i.test(url)) { await ctx.reply('Usage: /CMDNAME <https URL of a public JSON API>'); return; }
try {
  if (typeof ctx.fetchPublic !== 'function') throw new Error('safe fetch is unavailable in this build');
  const r = await ctx.fetchPublic(url, { maxBytes: 1048576, headers: { accept: 'application/json' } });
  if (r.status < 200 || r.status >= 300) throw new Error('API returned HTTP ' + r.status);
  const text = r.body.toString('utf8');
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
  await ctx.reply(pretty.slice(0, 3000) || '(empty response)');
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  quote: {
    match: /\bquote\b|\bmotivation\b/i,
    desc: 'Send a random quote',
    usage: '(no input)',
    minArgs: 0,
    body: `try {
  const r = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('quote service returned HTTP ' + r.status);
  const d = await r.json();
  const q = Array.isArray(d) && d[0] ? d[0] : {};
  await ctx.reply('"' + (q.q || '').slice(0, 800) + '" - ' + (q.a || 'unknown'));
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  advice: {
    match: /\badvice\b/i,
    desc: 'Send a random piece of advice',
    usage: '(no input)',
    minArgs: 0,
    body: `try {
  const r = await fetch('https://api.adviceslip.com/advice', { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('advice service returned HTTP ' + r.status);
  const d = await r.json();
  await ctx.reply((d.slip && d.slip.advice ? String(d.slip.advice) : 'No advice right now.').slice(0, 800));
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  quiz: {
    match: /\bquiz\b|\btrivia\b/i,
    desc: 'Start a 5-question trivia quiz (multi-turn)',
    usage: '(no input)',
    minArgs: 0,
    body: `try {
  const S = await import('../utils/sessions.js');
  const r = await fetch('https://opentdb.com/api.php?amount=5&type=multiple', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('quiz service returned HTTP ' + r.status);
  const d = await r.json();
  const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const qs = (d.results || []).map((q) => {
    const answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5).map(decode);
    return { q: decode(q.question), answers, correct: decode(q.correct_answer) };
  });
  if (!qs.length) throw new Error('no questions returned');
  const state = { qs, i: 0, score: 0 };
  const started = S.begin(ctx, { cmd: 'CMDNAME', ttlMs: 15 * 60e3, handlerKey: 'quiz', state });
  if (!started) throw new Error('could not start the quiz session');
  await ctx.reply('Quiz starting - answer with 1-4. Progress is saved: if I restart mid-quiz, your next answer continues where you left off (within 15 min).');
  const first = state.qs[0];
  await ctx.reply('Q1/' + state.qs.length + ': ' + first.q + '\\n' + first.answers.map((a, j) => (j + 1) + '. ' + a).join('\\n'));
} catch (e) { await ctx.reply('Error: ' + String(e && e.message || e).slice(0, 150)); }`,
  },
  dice: {
    match: /\bdice\b|\bcoin\b|\bflip\b/i,
    desc: 'Roll dice or flip a coin',
    usage: '[dice|coin]',
    minArgs: 0,
    body: `const what = (ctx.args[0] || '').toLowerCase();
if (what === 'coin' || what === 'flip') {
  await ctx.reply('Coin flip: ' + (Math.random() < 0.5 ? 'Heads' : 'Tails'));
  return;
}
const n = 1 + Math.floor(Math.random() * 6);
await ctx.reply('Dice roll: ' + n);`,
  },
};

/** Pick a template for a natural-language requirement, or null. */
export function pickTemplate(requirement) {
  for (const [key, t] of Object.entries(TEMPLATES)) {
    if (t.match.test(requirement)) return { key, ...t };
  }
  return null;
}
