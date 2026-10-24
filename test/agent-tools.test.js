import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, parseToolStep, takeTool, resetToolLimits, toolLimits, relevant, runSearch, readUrl } from '../src/agent/tools.js';
import { parseSafePlan, runSafeStep, summarizeFindings, parseShellPlan, safePlannerPrompt, ensureUrlsRead } from '../src/commands/agent.js';

// Item 2 (Oct 24): agent tools for everyone with per-user hourly limits. Network is mocked here; live checks are in the report.

test('parseToolStep: known tools only, arguments trimmed and capped; read needs a URL or result:N', () => {
  assert.deepEqual(parseToolStep({ tool: 'search', q: '  kesariya lyrics \n' }), { type: 'tool', tool: 'search', arg: 'kesariya lyrics' });
  assert.deepEqual(parseToolStep({ tool: 'read', url: 'https://example.com/a' }), { type: 'tool', tool: 'read', arg: 'https://example.com/a' });
  assert.deepEqual(parseToolStep({ tool: 'read', url: 'result:2' }), { type: 'tool', tool: 'read', arg: 'result:2' });
  assert.equal(parseToolStep({ tool: 'read', url: 'file:///etc/passwd' }), null);
  assert.equal(parseToolStep({ tool: 'read', url: 'localhost' }), null);
  assert.equal(parseToolStep({ tool: 'read', url: 'result:0' }), null);
  assert.equal(parseToolStep({ tool: 'shell', q: 'ls' }), null);
  assert.equal(parseToolStep({ tool: 'search', q: '   ' }), null);
  assert.equal(parseToolStep({ tool: 'image', prompt: 'x'.repeat(900) }).arg.length, 300);
  assert.equal(parseToolStep({ tool: 'song', args: 'Tum Hi Ho' }).arg, 'Tum Hi Ho');
  assert.deepEqual(parseToolStep({ search: 'IPL final' }), { type: 'tool', tool: 'search', arg: 'IPL final' }, 'short shape');
  assert.deepEqual(parseToolStep({ read: 'result:1' }), { type: 'tool', tool: 'read', arg: 'result:1' });
  assert.equal(parseToolStep({ search: 'a', image: 'b' }), null, 'two actions in one step are refused');
  assert.equal(parseToolStep({ search: { q: 'x' } }), null);
});

test('parseSafePlan: commands + tools; unknown command or bad tool rejects the whole plan; max 5 steps', () => {
  const p = parseSafePlan('ok [{"tool":"search","q":"IPL final 2026"},{"tool":"read","url":"result:1"},{"cmd":"weather","args":"Kolkata"},{"cmd":"song","args":"Kesariya"}]');
  assert.deepEqual(p, [{ type: 'tool', tool: 'search', arg: 'IPL final 2026' }, { type: 'tool', tool: 'read', arg: 'result:1' }, { cmd: 'weather', args: 'Kolkata' }, { type: 'tool', tool: 'song', arg: 'Kesariya' }]);
  assert.equal(parseSafePlan('[{"cmd":"kick","args":"@x"}]'), null);
  assert.equal(parseSafePlan('[{"tool":"read","url":"http://"}]'), null);
  assert.equal(parseSafePlan('[{"tool":"exec","q":"rm -rf /"}]'), null);
  assert.equal(parseSafePlan('no json here'), null);
  assert.equal(parseSafePlan(JSON.stringify(Array.from({ length: 9 }, () => ({ tool: 'search', q: 'a' })))).length, 5);
  assert.deepEqual(parseSafePlan('[{"answer":"Hi!"}]'), [{ answer: 'Hi!' }]);
  assert.deepEqual(parseSafePlan('[{"search":"x y"},{"read":"result:1"},{"image":"a cat"}]').map((s) => s.tool), ['search', 'read', 'image']);
});

test('planner prompt lists every tool', () => {
  const p = safePlannerPrompt('find X', 'ask, play');
  for (const t of Object.keys(TOOLS)) assert.match(p, new RegExp('\\{"' + t + '":"'));
  assert.ok(!/"tool"/.test(p), 'no "tool" wording: gpt-oss models answer it with a function call and no text');
});

test('per-user hourly limits per tool; owner never limited; separate users and tools; window slides', () => {
  resetToolLimits();
  const t0 = 1_000_000_000_000;
  for (let i = 0; i < 10; i++) assert.equal(takeTool('u1', 'search', { now: t0 + i }).ok, true);
  const no = takeTool('u1', 'search', { now: t0 + 60e3 });
  assert.equal(no.ok, false); assert.equal(no.retryMin, 59);
  assert.equal(takeTool('u2', 'search', { now: t0 }).ok, true, 'another user has their own budget');
  assert.equal(takeTool('u1', 'read', { now: t0 }).ok, true, 'another tool has its own budget');
  assert.equal(takeTool('u1', 'search', { now: t0 + 3600e3 + 5 }).ok, true, 'an hour later the oldest use expired');
  for (let i = 0; i < 50; i++) assert.equal(takeTool('owner', 'video', { isOwner: true, now: t0 }).ok, true);
  assert.equal(toolLimits({ AGENT_TOOL_LIMITS: 'video=1, search=20,bogus=3' }).video, 1);
  assert.equal(toolLimits({ AGENT_TOOL_LIMITS: 'video=1, search=20,bogus=3' }).search, 20);
  resetToolLimits();
  assert.equal(takeTool('u3', 'video', { now: t0, env: { AGENT_TOOL_LIMITS: 'video=1' } }).ok, true);
  assert.equal(takeTool('u3', 'video', { now: t0, env: { AGENT_TOOL_LIMITS: 'video=1' } }).ok, false);
  resetToolLimits();
});

test('search: unrelated engine results are dropped; empty search reported', async () => {
  const res = [{ title: 'Telegram Desktop', url: 'https://desktop.telegram.org', snippet: 'Fast app' }, { title: 'Arijit Singh new song', url: 'https://x.com/a', snippet: '2026 release' }];
  assert.deepEqual(relevant(res, 'Arijit Singh latest song').map((r) => r.title), ['Arijit Singh new song']);
  assert.equal(relevant(res, 'zzqq unknownword').length, 2, 'never drops everything');
  const r = await runSearch('arijit singh song', { search: async () => res });
  assert.equal(r.ok, true); assert.match(r.text, /1\. Arijit Singh new song \(x\.com\/a\)/); assert.ok(!/Telegram/.test(r.text));
  const e = await runSearch('nothing', { search: async () => [] });
  assert.equal(e.ok, false);
});

const html = (body, type = 'text/html; charset=utf-8', status = 200) => async () => ({ status, headers: { 'content-type': type }, body: Buffer.from(body), finalUrl: 'https://news.example.com/a' });
test('read: title + readable text (nav/script stripped), capped; binary, errors and HTTP codes reported', async () => {
  const page = '<html><head><title>Big News</title><script>evil()</script></head><body><nav>Menu Home</nav><p>Hello &amp; welcome.</p><p>' + 'word '.repeat(3000) + '</p></body></html>';
  const r = await readUrl('https://news.example.com/a', { fetcher: html(page) });
  assert.equal(r.ok, true); assert.equal(r.title, 'Big News');
  assert.ok(r.text.startsWith('Hello & welcome.'), r.text.slice(0, 40)); assert.ok(!/evil|Menu Home/.test(r.text));
  assert.ok(r.text.length <= 4002);
  assert.match((await readUrl('https://x.example.com/f.pdf', { fetcher: html('%PDF', 'application/pdf') })).text, /application\/pdf file/);
  assert.match((await readUrl('https://x.example.com', { fetcher: html('no', 'text/html', 404) })).text, /HTTP 404/);
  assert.match((await readUrl('https://x.example.com', { fetcher: async () => { throw new Error('Response too large'); } })).text, /too large/);
  assert.equal((await readUrl('https://x.example.com', { fetcher: html('{"a":1}', 'application/json') })).text, '{"a":1}');
});

test('read: the real SSRF guard blocks private and metadata addresses (no network needed)', async () => {
  for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/admin', 'http://[::1]/', 'https://user:pw@example.com/', 'http://example.com:8080/']) {
    const r = await readUrl(u);
    assert.equal(r.ok, false, u);
    assert.match(r.text, /not allowed|Could not open/, u);
  }
});

function ctxOf(extra = {}) {
  const replies = [];
  return { replies, ctx: { sender: 'user1@s.whatsapp.net', jid: 'chat@s.whatsapp.net', isOwner: false, args: [], reply: async (t) => { replies.push(String(t)); return null; }, ...extra } };
}

test('runSafeStep: search then read result:1 reads the first search hit; missing result is explained', async () => {
  resetToolLimits();
  const { ctx } = ctxOf();
  const state = { lastResults: [] };
  let readArg = '';
  const deps = { runSearch: async () => ({ ok: true, text: '1. A (a.com)', results: [{ url: 'https://a.com/x', title: 'A' }] }), readUrl: async (u) => { readArg = u; return { ok: true, title: 'A page', finalUrl: u, text: 'body text' }; } };
  const s1 = await runSafeStep(ctx, { type: 'tool', tool: 'search', arg: 'q' }, state, deps);
  assert.equal(s1.finding.text, '1. A (a.com)');
  const s2 = await runSafeStep(ctx, { type: 'tool', tool: 'read', arg: 'result:1' }, state, deps);
  assert.equal(readArg, 'https://a.com/x'); assert.equal(s2.finding.text, 'body text');
  const s3 = await runSafeStep(ctx, { type: 'tool', tool: 'read', arg: 'result:3' }, state, deps);
  assert.equal(s3.ok, false); assert.match(s3.text, /no search result #3/);
  resetToolLimits();
});

test('runSafeStep: media tools run the existing commands with the user context; limit hit is a clear note', async () => {
  resetToolLimits();
  const ran = [];
  const reg = { get: (n) => ({ run: async (c) => { ran.push([n, c.args.join(' '), c.jid]); } }) };
  const { ctx } = ctxOf();
  const env = process.env.AGENT_TOOL_LIMITS; process.env.AGENT_TOOL_LIMITS = 'video=1';
  try {
    assert.equal((await runSafeStep(ctx, { type: 'tool', tool: 'song', arg: 'Tum Hi Ho' }, {}, { registry: reg })).ok, true);
    assert.equal((await runSafeStep(ctx, { type: 'tool', tool: 'image', arg: 'a red car' }, {}, { registry: reg })).ok, true);
    assert.equal((await runSafeStep(ctx, { type: 'tool', tool: 'video', arg: 'Kesariya' }, {}, { registry: reg })).ok, true);
    const blocked = await runSafeStep(ctx, { type: 'tool', tool: 'video', arg: 'again' }, {}, { registry: reg });
    assert.equal(blocked.ok, false); assert.match(blocked.text, /Limit reached for video download \(1 per hour\)/);
    assert.deepEqual(ran.map((r) => r.slice(0, 2)), [['play', 'Tum Hi Ho'], ['imagine', 'a red car'], ['video', 'Kesariya']]);
    assert.equal(ran[0][2], 'chat@s.whatsapp.net');
    const owner = ctxOf({ isOwner: true }).ctx;
    assert.equal((await runSafeStep(owner, { type: 'tool', tool: 'video', arg: 'x' }, {}, { registry: reg })).ok, true, 'owner is not limited');
  } finally { if (env === undefined) delete process.env.AGENT_TOOL_LIMITS; else process.env.AGENT_TOOL_LIMITS = env; resetToolLimits(); }
});

test('summary: AI writes the answer from findings; raw findings when the AI is down', async () => {
  let prompt = '';
  const ok = await summarizeFindings('who won', [{ label: 'Web search: who won', text: '1. India won (espn.com)' }], async (p) => { prompt = p; return { text: 'India won. Sources: espn.com' }; });
  assert.equal(ok, 'India won. Sources: espn.com'); assert.match(prompt, /ONLY what I found/); assert.match(prompt, /India won \(espn\.com\)/);
  const md = await summarizeFindings('q', [{ label: 'x', text: 'y' }], async () => ({ text: '## Title\nThe answer is **Node 26**.' }));
  assert.equal(md, 'Title\nThe answer is *Node 26*.', 'markdown turned into WhatsApp formatting');
  const down = await summarizeFindings('who won', [{ label: 'Web search: who won', text: '1. India won (espn.com)' }], async () => { throw new Error('all failed'); });
  assert.match(down, /India won \(espn\.com\)/);
});

test('owner shell planner also takes tools: search/read stay tools, media tools become their commands', () => {
  const p = parseShellPlan('[{"search":"node 24 release"},{"tool":"song","q":"Kesariya"},{"read":"result:1"}]');
  assert.deepEqual(p.steps, [{ type: 'tool', tool: 'search', arg: 'node 24 release' }, { type: 'cmd', cmd: 'play', args: 'Kesariya' }, { type: 'tool', tool: 'read', arg: 'result:1' }]);
  assert.equal(parseShellPlan('[{"tool":"nope","q":"x"}]'), null);
});

test('a page link in the goal that the plan ignores is read first; media links and used links are left alone', () => {
  const plan = [{ type: 'tool', tool: 'search', arg: 'node release' }];
  assert.deepEqual(ensureUrlsRead('read https://nodejs.org/en/blog, and tell me', plan).map((s) => s.arg), ['https://nodejs.org/en/blog', 'node release']);
  assert.equal(ensureUrlsRead('play https://youtu.be/abc', [{ type: 'tool', tool: 'song', arg: 'https://youtu.be/abc' }]).length, 1);
  assert.equal(ensureUrlsRead('song https://youtu.be/abc please', [{ type: 'tool', tool: 'song', arg: 'kesariya' }]).length, 1, 'media links are not read as pages');
  const used = [{ type: 'tool', tool: 'read', arg: 'https://a.com/x' }];
  assert.equal(ensureUrlsRead('summarize https://a.com/x', used), used);
  assert.equal(ensureUrlsRead('x', null), null);
  assert.equal(ensureUrlsRead('read https://a.com/1 https://b.com/2', Array.from({ length: 5 }, () => ({ type: 'tool', tool: 'search', arg: 'q' }))).length, 5, 'still at most 5 steps');
});
