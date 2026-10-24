// Item 8: sandbox for agent-generated code. Every escape attempt must be
// blocked or killed; every test has its own timeout so a broken sandbox fails
// the test instead of hanging the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSandboxed, bodyModule, runGeneratedCommand, childArgs, bodyWantsNet, sandboxLimits, modulesReadable, dataLimitKb } from '../src/utils/sandbox.js';
import { generatedCommandFromSource, sandboxedCommand, isTemplateBody } from '../src/utils/genload.js';
import { buildCommandFile } from '../src/utils/genregistry.js';
import { validateGeneratedSource } from '../src/utils/genstruct.js';
import { TEMPLATES } from '../src/utils/templates.js';
import { stripReasoning, PROVIDERS } from '../src/ai/providers.js';

const T = { timeout: 30000 };
const LIM = { wallMs: 6000, cpuSeconds: 2 };
async function sbx(body, { net = false, ctx = {}, limits = {}, fetch } = {}) {
  const got = [];
  const r = await runSandboxed(bodyModule(body), {
    ctx: { args: ['a', 'b'], jid: 'chat@s.whatsapp.net', ...ctx }, net, limits: { ...LIM, ...limits },
    handlers: { reply: (t) => got.push(t), send: (j, c, o) => got.push({ j, c, o }), fetch },
  });
  return { ...r, got };
}
const SECRET = path.join(process.cwd(), '.env.example');

test('a normal body runs and replies', T, async () => {
  const r = await sbx("await ctx.reply('hi ' + ctx.args.join(','));");
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.got, ['hi a,b']);
});

test('reading .env / project files is blocked', T, async () => {
  for (const p of [SECRET, path.join(process.cwd(), 'src', 'config', 'config.js'), '/etc/passwd', '/proc/self/environ']) {
    const r = await sbx(`const fs = await import('node:fs'); await ctx.reply(fs.readFileSync(${JSON.stringify(p)}, 'utf8'));`);
    assert.equal(r.ok, false, p); assert.match(r.error, /ERR_ACCESS_DENIED/); assert.deepEqual(r.got, []);
  }
});

test('path traversal and symlinks out of the temp dir are blocked', T, async () => {
  const rel = path.relative(os.tmpdir(), SECRET);
  let r = await sbx(`const fs = await import('node:fs'); await ctx.reply(fs.readFileSync(process.cwd() + '/../' + ${JSON.stringify(rel)}, 'utf8'));`);
  assert.equal(r.ok, false); assert.deepEqual(r.got, []);
  r = await sbx(`const fs = await import('node:fs'); await ctx.reply(fs.readFileSync(${JSON.stringify(path.join(process.cwd(), 'node_modules', '..', '.env.example'))}, 'utf8'));`);
  assert.equal(r.ok, false); assert.deepEqual(r.got, []);
  r = await sbx(`const fs = await import('node:fs'); fs.symlinkSync(${JSON.stringify(SECRET)}, 'x'); await ctx.reply(fs.readFileSync('x', 'utf8'));`);
  assert.equal(r.ok, false); assert.match(r.error, /ERR_ACCESS_DENIED/);
  r = await sbx(`await import(${JSON.stringify(path.join(process.cwd(), 'src', 'utils', 'sessions.js'))}); await ctx.reply('imported');`);
  assert.equal(r.ok, false); assert.deepEqual(r.got, []);
});

test('writing outside the temp dir is blocked; os.tmpdir() works', T, async () => {
  const target = path.join(process.cwd(), 'data', 'sbx-pwned-' + process.pid);
  let r = await sbx(`const fs = await import('node:fs'); fs.writeFileSync(${JSON.stringify(target)}, 'x');`);
  assert.equal(r.ok, false); assert.match(r.error, /ERR_ACCESS_DENIED/); assert.equal(fs.existsSync(target), false);
  r = await sbx("const os = await import('node:os'); const fs = await import('node:fs'); const p = os.tmpdir() + '/a.txt'; fs.writeFileSync(p, 'hello'); await ctx.sock.sendMessage(ctx.jid, { document: fs.readFileSync(p), fileName: 'a.txt', mimetype: 'text/plain' });");
  assert.equal(r.ok, true, r.error); assert.equal(r.got[0].c.document.toString(), 'hello');
});

test('child_process, workers, inspector, eval and native addons are blocked', T, async () => {
  for (const body of [
    "const cp = await import('node:child_process'); await ctx.reply(cp.execSync('id').toString());",
    "const cp = await import('node:child_process'); cp.spawn('sh', ['-c', 'id']); await ctx.reply('spawned');",
    "const { Worker } = await import('node:worker_threads'); new Worker(" + JSON.stringify(path.join(process.cwd(), 'src', 'utils', 'sandbox-child.mjs')) + "); await ctx.reply('w');",
    "const i = await import('node:inspector'); i.open(0); await ctx.reply('open');",
    "await ctx.reply(String(eval('1+1')));",
    "await ctx.reply(String(new Function('return 1')()));",
    "process.dlopen({ exports: {} }, '/nonexistent.node'); await ctx.reply('x');",
  ]) {
    const r = await sbx(body);
    assert.equal(r.ok, false, body); assert.deepEqual(r.got, [], body);
  }
});

test('network is off by default: fetch, net, tls, http(s), dns, dgram', T, async () => {
  for (const body of [
    "const r = await fetch('https://example.com'); await ctx.reply(String(r.status));",
    "const net = await import('node:net'); await new Promise((ok, no) => { const s = net.connect(443, '1.1.1.1', ok); s.on('error', no); }); await ctx.reply('connected');",
    "const net = await import('node:net'); const s = new net.Socket(); s.connect(80, '127.0.0.1'); await ctx.reply('x');",
    "const net = await import('node:net'); net.createServer().listen(0); await ctx.reply('x');",
    "const tls = await import('node:tls'); tls.connect(443, 'example.com'); await ctx.reply('x');",
    "const https = await import('node:https'); https.get('https://example.com'); await ctx.reply('x');",
    "const http = await import('node:http'); http.request('http://169.254.169.254/'); await ctx.reply('x');",
    "const dns = await import('node:dns/promises'); await ctx.reply(JSON.stringify(await dns.lookup('example.com')));",
    "const dns = await import('node:dns'); await new Promise((ok, no) => dns.resolve4('example.com', (e, a) => e ? no(e) : ok(a))); await ctx.reply('x');",
    "const dgram = await import('node:dgram'); dgram.createSocket('udp4').send('x', 53, '8.8.8.8'); await ctx.reply('x');",
    "await ctx.fetchPublic('https://example.com');",
    "if (typeof WebSocket !== 'undefined') new WebSocket('wss://example.com'); else throw new Error('no WebSocket');",
  ]) {
    const r = await sbx(body);
    assert.equal(r.ok, false, body); assert.deepEqual(r.got, [], body);
  }
});

test('process.env is empty of secrets; signals to the bot are blocked', T, async () => {
  process.env.SBX_TEST_SECRET = 'leak-me';
  try {
    let r = await sbx('await ctx.reply(JSON.stringify(process.env));');
    assert.equal(r.ok, true, r.error); assert.doesNotMatch(r.got[0], /leak-me|API_KEY|TOKEN/);
    r = await sbx("process.kill(process.ppid, 'SIGKILL'); await ctx.reply('killed');");
    assert.equal(r.ok, false); assert.match(r.error, /ERR_SANDBOX_KILL/);
    r = await sbx("const os = await import('node:os'); os.setPriority(process.ppid, 19); await ctx.reply('x');");
    assert.equal(r.ok, false);
  } finally { delete process.env.SBX_TEST_SECRET; }
});

test('an infinite loop is stopped by the CPU limit', T, async () => {
  const r = await sbx('while (true) {}', { limits: { wallMs: 15000, cpuSeconds: 2 } });
  assert.equal(r.ok, false); assert.ok(['cpu', 'limit', 'timeout'].includes(r.killed), r.killed);
  assert.ok(r.ms < 12000, 'took ' + r.ms);
});

test('a hanging promise is stopped by the wall clock (whole process group killed)', T, async () => {
  const r = await sbx('await new Promise(() => {});', { limits: { wallMs: 1500 } });
  assert.equal(r.ok, false); assert.equal(r.killed, 'timeout'); assert.ok(r.ms < 5000);
});

test('memory bombs (heap and off-heap) are stopped', T, async () => {
  for (const body of [
    "const a = []; while (true) a.push(new Array(1e5).fill('x'));",
    'const a = []; while (true) a.push(Buffer.alloc(16 * 1024 * 1024, 1));',
    "const b = Buffer.alloc(1024 * 1024 * 1024, 1); await ctx.reply('got ' + b.length);",
    "const a = []; for (let i = 0; i < 100; i++) a.push(new Uint8Array(64 * 1024 * 1024).fill(1)); await ctx.reply('ok');",
    "let s = 'x'; while (true) s += s;",
  ]) {
    const r = await sbx(body, { limits: { wallMs: 10000 } });
    assert.equal(r.ok, false, body); assert.deepEqual(r.got, [], body);
  }
});

test('disk bombs in the temp dir are stopped and the temp dir is removed', T, async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('tab-sbx-')).length;
  for (const body of [
    "const fs = await import('node:fs'); const b = Buffer.alloc(1024 * 1024, 1); for (let i = 0; i < 200; i++) fs.writeFileSync('f' + i, b); await ctx.reply('wrote');",
    "const fs = await import('node:fs'); const b = Buffer.alloc(1024 * 1024, 1); fs.writeFileSync('big', Buffer.alloc(100 * 1024 * 1024, 1)); await ctx.reply('wrote');",
    "const fs = await import('node:fs'); for (let i = 0; i < 5000; i++) fs.writeFileSync('n' + i, ''); await new Promise((r) => setTimeout(r, 1000)); await ctx.reply('many');",
  ]) {
    const r = await sbx(body);
    assert.equal(r.ok, false, body); assert.deepEqual(r.got, [], body);
  }
  const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('tab-sbx-')).length;
  assert.ok(after <= before, 'temp dirs left behind');
});

test('reply spam, messages to other chats and bad media fields are refused', T, async () => {
  let r = await sbx("for (let i = 0; i < 50; i++) await ctx.reply('x' + i);");
  assert.equal(r.ok, false); assert.equal(r.got.length, sandboxLimits().maxReplies);
  r = await sbx("await ctx.sock.sendMessage('123@s.whatsapp.net', { text: 'hi' });");
  assert.equal(r.ok, false); assert.match(r.error, /only send to the chat/); assert.deepEqual(r.got, []);
  r = await sbx("await ctx.sock.sendMessage(ctx.jid, { text: 'hi', mentions: ['1@s.whatsapp.net'] });");
  assert.equal(r.ok, false); assert.deepEqual(r.got, []);
  r = await sbx("await ctx.sock.sendMessage(ctx.jid, { image: { url: 'https://example.com/a.png' } });");
  assert.equal(r.ok, false); assert.match(r.error, /network/i);
});

test('a protocol flood (huge line on the control pipe) kills the child', T, async () => {
  const r = await sbx("const fs = await import('node:fs'); fs.writeSync(3, 'x'.repeat(500000)); await new Promise((r) => setTimeout(r, 3000));");
  assert.equal(r.ok, false); assert.equal(r.killed, 'protocol');
});

test('exit, throw and stray rejections are reported cleanly', T, async () => {
  let r = await sbx('process.exit(3);');
  assert.equal(r.ok, false); assert.match(r.error, /exit 3/);
  r = await sbx("throw new Error('boom');");
  assert.equal(r.ok, false); assert.equal(r.error, 'boom');
  r = await sbx("setTimeout(() => { throw new Error('late'); }, 10); await new Promise((r) => setTimeout(r, 200));");
  assert.equal(r.ok, false); assert.match(r.error, /late/);
  r = await sbx("Promise.reject(new Error('stray')); await ctx.reply('fine');");
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.got, ['fine']);
});

test('installed npm packages can be imported (read-only)', T, async () => {
  if (!modulesReadable()) return;
  const r = await sbx("const { default: dayjs } = await import('dayjs'); await ctx.reply(dayjs('2020-01-02').format('YYYY'));");
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.got, ['2020']);
  const w = await sbx("const fs = await import('node:fs'); fs.writeFileSync(" + JSON.stringify(path.join(process.cwd(), 'node_modules', 'sbx-pwn')) + ", 'x');");
  assert.equal(w.ok, false); assert.match(w.error, /ERR_ACCESS_DENIED/);
});

test('guarded network bridge: https only, via the parent, capped', T, async () => {
  const calls = [];
  const fetch = async (u, o) => { calls.push([u, o.method]); return { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'x' }, body: Buffer.from(JSON.stringify({ v: 7 })), finalUrl: u }; };
  let r = await sbx("const r = await fetch('https://api.example.com/v'); const j = await r.json(); await ctx.reply(String(j.v) + ' ' + r.headers.get('set-cookie'));", { net: true, fetch });
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.got, ['7 null']); assert.deepEqual(calls, [['https://api.example.com/v', 'GET']]);
  r = await sbx("await fetch('http://example.com/');", { net: true, fetch });
  assert.equal(r.ok, false); assert.match(r.error, /https/);
  r = await sbx("for (let i = 0; i < 50; i++) await fetch('https://a.example/' + i);", { net: true, fetch });
  assert.equal(r.ok, false); assert.match(r.error, /too many network requests/);
  r = await sbx("const p = await ctx.fetchPublic('https://img.example/x.png'); await ctx.sock.sendMessage(ctx.jid, { image: p.body, caption: 'c' }, { quoted: ctx.msg });", { net: true, fetch });
  assert.equal(r.ok, true, r.error); assert.equal(r.got[0].j, 'chat@s.whatsapp.net'); assert.equal(r.got[0].o.quoted, true);
  // raw sockets stay blocked even with the bridge on
  r = await sbx("const net = await import('node:net'); net.connect(443, '1.1.1.1'); await ctx.reply('x');", { net: true, fetch });
  assert.equal(r.ok, false); assert.match(r.error, /ERR_SANDBOX_NET/);
});

test('child flags: permission model on, no child-process/worker/addon grants, heap capped', () => {
  const a = childArgs({ work: '/tmp/w', heapMb: 48 });
  assert.ok(a.includes('--permission'));
  assert.ok(a.includes('--max-old-space-size=48'));
  assert.ok(a.includes('--allow-fs-write=/tmp/w'));
  assert.ok(a.includes('--disallow-code-generation-from-strings'));
  assert.ok(a.includes('--no-addons'));
  for (const f of a) assert.doesNotMatch(f, /allow-(child-process|worker|addons|wasi|net|inspector)/);
  assert.equal(a.filter((f) => f.startsWith('--allow-fs-write')).length, 1);
  assert.ok(!a.some((f) => f === '--allow-fs-read=' + process.cwd() || f === '--allow-fs-read=*'));
});

test('data rlimit is calibrated to this Node binary', T, async () => {
  const kb = await dataLimitKb(sandboxLimits());
  assert.ok(kb === 0 || kb > 128 * 1024);
});

test('bodyWantsNet only for bodies that fetch', () => {
  assert.equal(bodyWantsNet("await ctx.reply('hi')"), false);
  assert.equal(bodyWantsNet("const r = await fetch('https://x.y')"), true);
  assert.equal(bodyWantsNet("await ctx.fetchPublic(u)"), true);
});

test('generated command files load as sandboxed commands; templates stay in-process', T, async () => {
  const body = "const fs = await import('node:fs'); fs.writeFileSync(" + JSON.stringify(path.join(process.cwd(), 'data', 'sbx-marker')) + ", 'x'); await ctx.reply('wrote');";
  const code = buildCommandFile('zzsbx', { desc: 'test', usage: '<x>', minArgs: 0, body });
  const v = validateGeneratedSource(code, body);
  assert.equal(v.ok, true); assert.equal(v.body, body); assert.equal(v.meta.name, 'zzsbx'); assert.equal(v.meta.minArgs, 0);
  const file = path.join(os.tmpdir(), 'zzsbx-' + process.pid + '.js');
  fs.writeFileSync(file, code);
  try {
    const cmd = await generatedCommandFromSource(code, file);
    assert.equal(cmd.sandboxed, true); assert.equal(cmd.name, 'zzsbx'); assert.equal(cmd.usage, 'zzsbx <x>');
    const got = [];
    await assert.rejects(cmd.run({ args: [], jid: 'c@s.whatsapp.net', reply: async (t) => got.push(t) }), /failed in the sandbox: ERR_ACCESS_DENIED/);
    assert.equal(fs.existsSync(path.join(process.cwd(), 'data', 'sbx-marker')), false);
    // a wrapper with code smuggled outside __run is still quarantined
    await assert.rejects(generatedCommandFromSource(code.replace('await __run(__ctx);', 'await __run(__ctx); globalThis.x = 1;'), file), /structural gate/);
  } finally { fs.unlinkSync(file); }
  const [key, tpl] = Object.entries(TEMPLATES)[0];
  assert.equal(isTemplateBody('zq', tpl.body.replaceAll('CMDNAME', 'zq')), true, key);
  assert.equal(isTemplateBody('zq', tpl.body.replaceAll('CMDNAME', 'zq') + '\n'), false);
});

test('sandboxed command logs "Error:" replies and passes ctx through', T, async () => {
  const seen = [];
  const cmd = sandboxedCommand({ name: 'zz', aliases: [], category: 'Tools', description: 'd', usage: 'zz', minArgs: 0 }, 'BODY', { run: async (name, body, ctx) => { seen.push([name, body, ctx.jid]); await ctx.reply('ok'); } });
  const out = [];
  await cmd.run({ jid: 'j', reply: async (t) => out.push(t) });
  assert.deepEqual(seen, [['zz', 'BODY', 'j']]); assert.deepEqual(out, ['ok']);
});

test('runGeneratedCommand throws with the sandbox reason', T, async () => {
  await assert.rejects(runGeneratedCommand('zz', 'while (true) {}', { args: [], jid: 'j', reply: async () => {} }, { limits: { wallMs: 1500, cpuSeconds: 5 } }), /zz failed in the sandbox: it took longer/);
});

test('providers: reasoning is stripped, models pinned and ordered', () => {
  assert.equal(stripReasoning('<think>secret plan</think>Hello'), 'Hello');
  assert.equal(stripReasoning('<think>\nmulti\nline</think>\n\nAnswer here'), 'Answer here');
  assert.equal(stripReasoning('<think>never closed'), '');
  assert.equal(stripReasoning('leftover reasoning</think>Final'), 'Final');
  assert.equal(stripReasoning('Plain answer'), 'Plain answer');
  const save = { g: process.env.GROQ_MODEL, o: process.env.OPENROUTER_MODEL };
  delete process.env.GROQ_MODEL; delete process.env.OPENROUTER_MODEL;
  try {
    const groq = PROVIDERS.find((p) => p.id === 'groq');
    assert.deepEqual(groq.models(), ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']);
    const or = PROVIDERS.find((p) => p.id === 'openrouter');
    const m = or.models();
    assert.equal(m[0], 'google/gemma-4-31b-it:free');
    assert.ok(m.every((x) => x.endsWith(':free')), 'only free models');
    assert.ok(!m.includes('openrouter/free'), 'no router, a pinned model');
  } finally { if (save.g !== undefined) process.env.GROQ_MODEL = save.g; if (save.o !== undefined) process.env.OPENROUTER_MODEL = save.o; }
});
