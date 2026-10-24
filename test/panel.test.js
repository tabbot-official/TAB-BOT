import test from 'node:test';
import assert from 'node:assert/strict';
import { panelConfig, redact, getStatus, formatStatus, power, getConsoleLogs, restartBot, panelRequest } from '../src/utilities/panel.js';
import panelCmd, { _resetPanelConfirm } from '../src/commands/panel.js';
import { parseShellPlan, screenPanelStep, panelCmdArgsAllowed } from '../src/commands/agent.js';
import { redact as shellRedact } from '../src/utilities/ownershell.js';

// Item 5 (Oct 24): owner-only Pterodactyl panel control. Mocked panel; the live read-only check is in the report.
const KEY = 'ptlc_TestKey0123456789abcdefghijABCDEFGHIJ0123';
const ENV = { PANEL_URL: 'https://control.example.com/', PANEL_SERVER_ID: '874ff87b', PANEL_API_KEY: KEY };
const ENVKEYS = ['PANEL_URL', 'PANEL_SERVER_ID', 'PANEL_API_KEY', 'REVIACTYL_PANEL_URL', 'REVIACTYL_CLIENT_KEY'];
function withPanelEnv(env, fn) {
  return async () => {
    const saved = Object.fromEntries(ENVKEYS.map((k) => [k, process.env[k]]));
    for (const k of ENVKEYS) delete process.env[k];
    Object.assign(process.env, env);
    const real = globalThis.fetch;
    _resetPanelConfirm();
    try { await fn(); } finally {
      globalThis.fetch = real;
      for (const k of ENVKEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  };
}
const RES = { attributes: { current_state: 'running', is_suspended: false, resources: { memory_bytes: 201 * 1048576, cpu_absolute: 12.34, disk_bytes: 303 * 1048576, uptime: 3 * 3600e3 + 5 * 60e3 } } };
const INFO = { attributes: { name: 'TAB BOT', limits: { memory: 308, disk: 716, cpu: 25 } } };
function mockPanel(calls, { powerStatus = 204 } = {}) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body, auth: init.headers?.Authorization });
    if (String(url).endsWith('/resources')) return new Response(JSON.stringify(RES), { status: 200 });
    if (String(url).endsWith('/power')) return new Response(null, { status: powerStatus });
    if (String(url).endsWith('/websocket')) return new Response(JSON.stringify({ data: { token: 'tok', socket: 'wss://node.example.com/ws' } }), { status: 200 });
    return new Response(JSON.stringify(INFO), { status: 200 });
  };
}
function ctxOf({ args = [], isOwner = true, isGroup = false } = {}) {
  const replies = [];
  return { ctx: { args, isOwner, isGroup, reply: async (t) => { replies.push(String(t)); return null; } }, replies };
}

test('panelConfig: needs URL, server id and a real key; REVIACTYL_* still accepted; no Jarvis ccedcbbd default', () => {
  assert.deepEqual(panelConfig({}).missing, ['PANEL_URL', 'PANEL_SERVER_ID', 'PANEL_API_KEY']);
  assert.equal(panelConfig(ENV).ok, true);
  assert.equal(panelConfig(ENV).url, 'https://control.example.com');
  assert.deepEqual(panelConfig({ ...ENV, PANEL_API_KEY: 'your-panel-key' }).missing, ['PANEL_API_KEY']);
  assert.deepEqual(panelConfig({ ...ENV, PANEL_URL: 'http://insecure.example.com' }).missing, ['PANEL_URL']);
  assert.deepEqual(panelConfig({ ...ENV, PANEL_SERVER_ID: '../../x' }).missing, ['PANEL_SERVER_ID']);
  assert.equal(panelConfig({ REVIACTYL_PANEL_URL: 'https://p.example.com', REVIACTYL_CLIENT_KEY: KEY, PANEL_SERVER_ID: 'abcd1234' }).ok, true);
  assert.equal(panelConfig({ REVIACTYL_PANEL_URL: 'https://p.example.com', REVIACTYL_CLIENT_KEY: KEY }).ok, false, 'server id is never assumed');
});

test('redact hides the key, any ptlc_ token and bearer tokens', () => {
  const cfg = panelConfig(ENV);
  const out = redact(`key=${KEY} Authorization: Bearer abcdefghijklmnop ptlc_${'Z'.repeat(40)}`, cfg);
  assert.ok(!out.includes(KEY) && !out.includes('abcdefghijklmnop') && !out.includes('Z'.repeat(40)));
});

test('status: GET resources + server info with the bearer key, formatted for WhatsApp', withPanelEnv(ENV, async () => {
  const calls = []; globalThis.fetch = mockPanel(calls);
  const s = await getStatus();
  assert.ok(calls.every((c) => c.url.startsWith('https://control.example.com/api/client/servers/874ff87b') && c.method === 'GET' && c.auth === 'Bearer ' + KEY));
  assert.deepEqual([s.state, s.memMB, s.memLimitMB, s.cpu, s.diskMB, s.diskLimitMB, s.uptime], ['running', 201, 308, 12.3, 303, 716, '3h 5m']);
  const text = formatStatus(s);
  assert.match(text, /🟢 running/); assert.match(text, /RAM: 201 MB \/ 308 MB/); assert.ok(!text.includes(KEY));
}));

test('power: POST {signal}; unknown signals refused before any request', withPanelEnv(ENV, async () => {
  const calls = []; globalThis.fetch = mockPanel(calls);
  await power('restart');
  assert.equal(calls[0].method, 'POST'); assert.match(calls[0].url, /\/874ff87b\/power$/); assert.deepEqual(JSON.parse(calls[0].body), { signal: 'restart' });
  await assert.rejects(power('reinstall'), /Unknown power signal/);
  assert.equal(calls.length, 1);
}));

test('errors never carry the key (401, 404, network error echoing the key)', withPanelEnv(ENV, async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ detail: 'bad ' + KEY }] }), { status: 401 });
  await assert.rejects(getStatus(), (e) => /refused the key/.test(e.message) && !e.message.includes(KEY));
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  await assert.rejects(panelRequest('/resources'), /server not found/);
  globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED with header Bearer ' + KEY); };
  await assert.rejects(panelRequest('/resources'), (e) => /unreachable/.test(e.message) && !e.message.includes(KEY));
}));

test('console logs: websocket auth then "send logs" only; ANSI stripped; key redacted', withPanelEnv(ENV, async () => {
  const calls = []; globalThis.fetch = mockPanel(calls);
  const sent = [];
  class FakeWS {
    constructor(url, opts) { this.url = url; this.opts = opts; this.h = {}; setTimeout(() => this.h.open?.(), 1); }
    on(ev, fn) { this.h[ev] = fn; }
    send(raw) {
      const m = JSON.parse(raw); sent.push(m.event);
      if (m.event === 'auth') setTimeout(() => this.h.message?.(JSON.stringify({ event: 'auth success' })), 1);
      if (m.event === 'send logs') setTimeout(() => { for (const l of ['\u001b[33mline one\u001b[39m', 'key ' + KEY, 'line three']) this.h.message?.(JSON.stringify({ event: 'console output', args: [l] })); }, 1);
    }
    close() { this.h.close?.(); }
  }
  const lines = await getConsoleLogs({ lines: 2, waitMs: 20, WebSocketImpl: FakeWS });
  assert.deepEqual(sent, ['auth', 'send logs'], 'never "send command"');
  assert.deepEqual(lines, ['key ***', 'line three']);
}));

test('restartBot: panel restart when configured, old exit otherwise or when the panel fails', withPanelEnv(ENV, async () => {
  const calls = []; let exits = 0; const shutdown = async () => { exits++; };
  assert.equal(await restartBot({ shutdown, delayMs: 0, fetchImpl: mockPanel(calls) }), 'panel');
  assert.equal(exits, 0); assert.deepEqual(JSON.parse(calls[0].body), { signal: 'restart' });
  assert.equal(await restartBot({ shutdown, delayMs: 0, fetchImpl: mockPanel([], { powerStatus: 500 }) }), 'exit');
  assert.equal(exits, 1);
  assert.equal(await restartBot({ shutdown, delayMs: 0, env: {} }), 'exit');
  assert.equal(exits, 2);
}));

test('.panel: owner only; setup hint without the key when unconfigured', withPanelEnv({}, async () => {
  let { ctx, replies } = ctxOf({ isOwner: false });
  await panelCmd.run(ctx); assert.match(replies[0], /Only the bot owner/);
  ({ ctx, replies } = ctxOf());
  await panelCmd.run(ctx); assert.match(replies[0], /PANEL_URL/); assert.match(replies[0], /PANEL_API_KEY/);
}));

test('.panel status / logs (DM only) / restart', withPanelEnv(ENV, async () => {
  const calls = []; globalThis.fetch = mockPanel(calls);
  let { ctx, replies } = ctxOf({ args: ['status'] });
  await panelCmd.run(ctx); assert.match(replies[0], /RAM: 201 MB/);
  ({ ctx, replies } = ctxOf({ args: ['logs'], isGroup: true }));
  await panelCmd.run(ctx); assert.match(replies[0], /private chat/);
  calls.length = 0;
  ({ ctx, replies } = ctxOf({ args: ['restart'] }));
  await panelCmd.run(ctx); assert.match(replies[0], /Restarting/);
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => JSON.parse(c.body).signal), ['restart']);
}));

test('.panel stop needs "stop yes" within 60 s; a bare yes without the warning does nothing', withPanelEnv(ENV, async () => {
  const calls = []; globalThis.fetch = mockPanel(calls);
  let { ctx, replies } = ctxOf({ args: ['stop', 'yes'] });
  await panelCmd.run(ctx);
  assert.equal(calls.length, 0, 'no stop without the warning first'); assert.match(replies[0], /panel stop yes/);
  ({ ctx, replies } = ctxOf({ args: ['stop'] }));
  await panelCmd.run(ctx); assert.equal(calls.length, 0);
  ({ ctx, replies } = ctxOf({ args: ['stop', 'yes'] }));
  await panelCmd.run(ctx);
  assert.deepEqual(calls.map((c) => JSON.parse(c.body).signal), ['stop']);
}));

test('.agent: {"panel":...} steps parse; stop/kill become refusal notes; the agent may only read through .panel', () => {
  const p = parseShellPlan('[{"panel":"status"},{"panel":"logs"},{"panel":"restart"},{"panel":"stop"}]');
  assert.deepEqual(p.steps, [{ type: 'panel', action: 'status' }, { type: 'panel', action: 'logs' }, { type: 'restart' }, { type: 'panel', action: 'stop' }]);
  assert.equal(screenPanelStep({ type: 'panel', action: 'status' }).type, 'panel');
  assert.equal(screenPanelStep({ type: 'panel', action: 'stop' }).type, 'note');
  assert.equal(screenPanelStep({ type: 'panel', action: 'kill' }).type, 'note');
  for (const a of ['', 'status', 'logs', 'logs 40', 'help']) assert.equal(panelCmdArgsAllowed(a), true, a);
  for (const a of ['stop', 'stop yes', 'kill yes', 'restart', 'status; stop']) assert.equal(panelCmdArgsAllowed(a), false, a);
});

test('owner shell output masks secret env values (e.g. echo $PANEL_API_KEY)', withPanelEnv(ENV, async () => {
  assert.ok(!shellRedact('value: ' + KEY).includes(KEY));
}));
