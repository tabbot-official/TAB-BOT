import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {detectEnv, ENVS} from '../src/telemetry/env.js';
import {buildPayload, validatePayload} from '../src/telemetry/payload.js';
import {Collector} from '../src/telemetry/collector.js';
const none = () => ''; const no = () => false;

test('detectEnv: fixed vocabulary from env markers only', () => {
  assert.equal(detectEnv({P_SERVER_UUID: 'x'}, 'linux', none, no), 'pterodactyl');
  assert.equal(detectEnv({STARTUP: 'node', SERVER_IP: '0.0.0.0'}, 'linux', none, no), 'pterodactyl');
  assert.equal(detectEnv({REPL_ID: '1'}, 'linux', none, no), 'replit');
  assert.equal(detectEnv({PREFIX: '/data/data/com.termux/files/usr'}, 'linux', none, no), 'termux');
  assert.equal(detectEnv({}, 'linux', (f) => (f.endsWith('sys_vendor') ? 'Amazon EC2' : ''), no), 'aws');
  assert.equal(detectEnv({}, 'linux', (f) => (f.endsWith('chassis_asset_tag') ? 'OracleCloud.com' : ''), no), 'oracle');
  assert.equal(detectEnv({}, 'linux', none, (f) => f === '/.dockerenv'), 'docker');
  assert.equal(detectEnv({}, 'linux', none, no), 'linux'); assert.equal(detectEnv({}, 'win32', none, no), 'windows'); assert.equal(detectEnv({}, 'darwin', none, no), 'macos'); assert.equal(detectEnv({}, 'freebsd', none, no), 'unknown');
  for (const e of [{P_SERVER_UUID: 'x'}, {}, {REPL_ID: '1'}]) assert.ok(ENVS.includes(detectEnv(e, 'linux', none, no)));
});
test('payload: env is allowlisted and validated', () => {
  const p = buildPayload({id: 'a'.repeat(24), ver: '1', up: 1, on: true, cmds: {}, env: 'pterodactyl'}); assert.equal(p.env, 'pterodactyl'); assert.ok(validatePayload(p));
  assert.equal(buildPayload({id: 'a'.repeat(24), ver: '1', up: 1, on: true, cmds: {}, env: 'my-host.example.com'}).env, undefined);
  assert.equal(validatePayload({...p, env: 'my-host.example.com'}), null);
});
test('collector: stores env, shows it per install and in the hosting breakdown', () => {
  const c = new Collector({file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'h-')), 'c.json')});
  const sid = c.ingest({v: 1, id: 'b'.repeat(24), ver: '1', up: 1, on: true, cmds: {}, env: 'pterodactyl'}, '1.1.1.1').sid;
  c.ingest({v: 1, id: 'c'.repeat(24), ver: '1', up: 1, on: true, cmds: {}, env: 'pterodactyl'}, '2.2.2.2'); c.ingest({v: 1, id: 'd'.repeat(24), ver: '1', up: 1, on: true, cmds: {}}, '3.3.3.3');
  assert.equal(c.detail(sid).env, 'pterodactyl'); assert.deepEqual(c.summary().hosting, [['pterodactyl', 2]]);
});
