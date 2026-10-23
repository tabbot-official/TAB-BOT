import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.OWNER_NUMBER ||= '919000000001';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-'));
const {clean, valid} = await import('../src/telemetry/feedback.js');
const {Collector} = await import('../src/telemetry/collector.js');
const {Telemetry} = await import('../src/telemetry/client.js');
const { default: feedback } = await import('../src/commands/feedback.js');
const { default: menu } = await import('../src/commands/menu.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fbt-'));
const ID = (c) => c.repeat(24);
const ping = (c) => ({v: 1, id: ID(c), ver: '1.9.0', up: 5, on: true, cmds: {ping: 1}});

test('clean removes numbers, emails, control chars and caps length', () => {
  assert.equal(clean('call me +91 98765-43210 or a.b@x.com now\nplease'), 'call me [number removed] or [email removed] now please');
  assert.equal(clean('x'.repeat(900)).length, 500); assert.equal(valid('too short'), null); assert.ok(valid('the sticker command fails'));
});

test('collector: feedback needs a known install, strict keys, 5 a day, 200 kept', () => {
  let now = 1e12; const c = new Collector({file: path.join(tmp(), 'c.json'), now: () => now});
  assert.equal(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'the menu is too long for me'}, '1.1.1.1'), null, 'unknown install');
  const sid = c.ingest(ping('a'), '1.1.1.1').sid;
  assert.deepEqual(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'the menu is too long, call 919876543210'}, '1.1.1.1'), {ok: true});
  const l = c.feedbackList(); assert.equal(l[0].sid, sid); assert.ok(!l[0].text.includes('9198765') && !JSON.stringify(l).includes(ID('a')));
  assert.equal(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'a valid long message', extra: 1}, '1.1.1.1'), null, 'extra key');
  assert.equal(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'short'}, '1.1.1.1'), null);
  for (let i = 0; i < 4; i++) assert.ok(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'another real message ' + i}, '1.1.1.1'));
  assert.equal(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'sixth message in one day'}, '1.1.1.1'), null, 'daily cap');
  now += 86400000 + 1; assert.ok(c.ingest({v: 1, k: 'fb', id: ID('a'), t: 'next day message is fine'}, '1.1.1.1'));
});

test('client: sends cleaned text, per-sender wait, daily cap, respects TELEMETRY=off', async () => {
  const sent = []; const f = async (u, o) => { sent.push(JSON.parse(o.body)); return {ok: true, status: 200}; };
  process.env.TELEMETRY = 'on'; // Jarvis: telemetry defaults on
  const t = new Telemetry({dir: tmp(), version: '1', fetchFn: f});
  assert.deepEqual(await t.sendFeedback('please add dark mode, my number 919876543210', 'u1'), {ok: true});
  assert.ok(!JSON.stringify(sent[0]).includes('919876543210')); assert.deepEqual(Object.keys(sent[0]).sort(), ['id', 'k', 't', 'v']);
  assert.equal((await t.sendFeedback('another message from same user', 'u1')).why, 'wait');
  for (let i = 0; i < 4; i++) assert.ok((await t.sendFeedback('message number ' + i + ' here', 'x' + i)).ok);
  assert.equal((await t.sendFeedback('one more message please', 'y')).why, 'daily');
  process.env.TELEMETRY = 'off'; try { assert.equal((await new Telemetry({dir: tmp(), version: '1', fetchFn: f}).sendFeedback('hello there friend', 'z')).why, 'off'); } finally { process.env.TELEMETRY = 'on'; }
  assert.equal((await new Telemetry({dir: tmp(), version: '1', fetchFn: async () => ({ok: false, status: 400})}).sendFeedback('hello there friend', 'z')).why, 'rejected');
});

test('command: short text refused; menu lists /feedback first', async () => {
  const out = []; const ctx = {args: ['hi'], sender: 's', reply: async (m) => out.push(String(m))};
  await feedback.run(ctx); assert.match(out[0], /at least 10/);
  const m = []; const ctx2 = {args: [], sender: 's', isOwner: false, isGroup: false, commands: {list: () => [feedback]}, reply: async (x) => m.push(String(x?.text ?? x)), msg: {key: {}}, jid: 'j'};
  await menu.run(ctx2); const text = m.join('\n'); const at = text.indexOf('📣'); assert.ok(at >= 0 && at < text.indexOf('```'), 'feedback line sits above the first block');
  assert.ok(text.split('\n').slice(0, 5).some((l) => l.includes('📣')), 'within the first lines');
});

test('Jarvis default: no TELEMETRY in env enables feedback and ping', async () => {
  const prev = process.env.TELEMETRY; delete process.env.TELEMETRY; let calls = 0;
  try { const t = new Telemetry({dir: tmp(), version: '1', fetchFn: async () => { calls++; return {ok: true, status: 200, json: async () => ({})}; }});
    assert.equal((await t.sendFeedback('hello there friend', 'z')).ok, true); await t.ping(); assert.ok(calls >= 2);
  } finally { if (prev === undefined) delete process.env.TELEMETRY; else process.env.TELEMETRY = prev; }
});
