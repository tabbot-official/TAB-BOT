import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'apic-'));
process.env.API_JWT_SECRET = 'test-secret-test-secret-test-secret';
const {createHandler} = await import('../src/api/server.js');
const {createKey} = await import('../src/api/services/keys.js');
const {setRegistry} = await import('../src/api/services/botService.js');
const {bus} = await import('../src/api/events/bus.js');
const {setSetting, getSetting} = await import('../src/database/database.js');

const cmds = [
  {name: 'dice', category: 'Games', description: 'roll', usage: 'dice', async run(ctx) { await ctx.reply('rolled 4'); }},
  {name: 'ban', category: 'Group', description: 'ban', usage: 'ban @x', requiredLevel: 'admin', async run(ctx) { await ctx.sock.groupParticipantsUpdate(); }},
  {name: 'define', category: 'Tools', description: 'def', usage: 'define word', minArgs: 1, async run(ctx) { await ctx.reply('def ' + ctx.args[0]); }},
  {name: 'fact', category: 'Games', description: 'fact', usage: 'fact', async run(ctx) { await ctx.sock.sendMessage(); }},
];
setRegistry({list: () => cmds, get: (n) => cmds.find((c) => c.name === n)});
const srv = http.createServer(createHandler()); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const call = (method, p, key, body) => new Promise((resolve, reject) => {
  const req = http.request({host: '127.0.0.1', port, method, path: p, headers: {'x-api-key': key, ...(body ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify(body))} : {})}}, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({status: res.statusCode, json: d ? JSON.parse(d) : null})); });
  req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
});
test.after(() => srv.close());

test('commands: list is read-only metadata; execute is allowlist only and cannot reach a socket', async () => {
  const ro = createKey('r', 'readonly'); const sv = createKey('s', 'service');
  const l = await call('GET', '/api/v1/commands', ro.key);
  assert.equal(l.json.data.commands.length, 4);
  assert.equal(l.json.data.commands.find((c) => c.name === 'dice').apiExecutable, true);
  assert.equal(l.json.data.commands.find((c) => c.name === 'ban').apiExecutable, false);
  assert.equal((await call('POST', '/api/v1/commands/dice/execute', ro.key, {})).status, 403);
  const r = await call('POST', '/api/v1/commands/dice/execute', sv.key, {});
  assert.equal(r.status, 200); assert.equal(r.json.data.output, 'rolled 4');
  assert.equal((await call('POST', '/api/v1/commands/ban/execute', sv.key, {})).status, 403);
  assert.equal((await call('POST', '/api/v1/commands/fact/execute', sv.key, {})).status, 422);
  assert.equal((await call('POST', '/api/v1/commands/define/execute', sv.key, {})).status, 400);
  assert.equal((await call('POST', '/api/v1/commands/define/execute', sv.key, {args: ['cat']})).json.data.output, 'def cat');
  assert.equal((await call('POST', '/api/v1/commands/nope/execute', sv.key, {})).status, 404);
  assert.equal((await call('GET', '/api/v1/commands/ban', ro.key)).json.data.requiredLevel, 'admin');
});

test('plugins: list, admin-only switch shares the /settings override, emits event', async () => {
  const sv = createKey('s', 'service'); const ad = createKey('a', 'admin'); const ro = createKey('r', 'readonly');
  const seen = []; bus.on('event', (e) => seen.push(e.type));
  assert.ok((await call('GET', '/api/v1/plugins', ro.key)).json.data.plugins.some((p) => p.name === 'games' && p.commands === 2));
  assert.equal((await call('POST', '/api/v1/plugins/games/disable', sv.key, {})).status, 403);
  const off = await call('POST', '/api/v1/plugins/games/disable', ad.key, {});
  assert.equal(off.json.data.enabled, false); assert.equal(getSetting('featureOverrides', {}).games, false);
  assert.equal((await call('GET', '/api/v1/commands', ro.key)).json.data.commands.find((c) => c.name === 'dice').enabled, false);
  assert.equal((await call('POST', '/api/v1/commands/dice/execute', sv.key, {})).status, 409);
  await call('POST', '/api/v1/plugins/games/enable', ad.key, {});
  assert.equal((await call('POST', '/api/v1/plugins/zzz/enable', ad.key, {})).status, 404);
  assert.ok(seen.includes('plugin.changed'));
});

test('ai: needs a key, validates input, quota per caller', async () => {
  const sv = createKey('s', 'service');
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];
  const r = await call('POST', '/api/v1/ai/chat', sv.key, {prompt: 'hi'});
  assert.ok([503, 502].includes(r.status)); assert.ok(!/key|secret/i.test(JSON.stringify(r.json).replace(/ai_not_configured|No AI provider is configured/g, '')));
  assert.equal((await call('POST', '/api/v1/ai/chat', sv.key, {})).status, 400);
  assert.equal((await call('POST', '/api/v1/ai/translate', sv.key, {text: 'hi'})).status, 400);
});
