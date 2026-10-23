import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'apid-'));
process.env.API_JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.TELEMETRY_COLLECTOR = 'on'; process.env.TELEMETRY_NOTIFY = 'off';
const {createHandler} = await import('../src/api/server.js');
const {createKey} = await import('../src/api/services/keys.js');
const srv = http.createServer(createHandler()); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const call = (method, p, key, body, xff) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = http.request({host: '127.0.0.1', port, method, path: p, headers: {...(key ? {'x-api-key': key} : {}), ...(xff ? {'x-forwarded-for': xff} : {}), ...(data ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(data)} : {})}}, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({status: res.statusCode, json: d ? JSON.parse(d) : null})); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
test.after(() => { srv.close(); setTimeout(() => process.exit(0), 50).unref(); });
const ping = (id, extra = {}) => ({v: 1, id, ver: '1.9.0', up: 100, on: true, cmds: {ping: 3}, ...extra});

test('telemetry via API: public ping, strict schema, summary needs a key', async () => {
  const r = await call('POST', '/api/v1/telemetry/ping', null, ping('a'.repeat(24)));
  assert.equal(r.status, 200); assert.match(r.json.data.sid, /^S-/);
  assert.equal((await call('POST', '/api/v1/telemetry/ping', null, ping('b'.repeat(24), {phone: '919876543210'}))).status, 400);
  assert.equal((await call('POST', '/api/v1/telemetry/ping', null, {v: 1})).status, 400);
  assert.equal((await call('GET', '/api/v1/telemetry/summary')).status, 401);
  const ro = createKey('r', 'readonly'); const sv = createKey('s', 'service');
  assert.equal((await call('GET', '/api/v1/telemetry/summary', ro.key)).status, 403);
  const s = await call('GET', '/api/v1/telemetry/summary', sv.key);
  assert.equal(s.status, 200); assert.ok(s.json.data.total >= 1); assert.ok(!/919876543210/.test(JSON.stringify(s.json)));
});

test('telemetry via API: 404 when this deployment is not the collector', async () => {
  const old = process.env.TELEMETRY_COLLECTOR; process.env.TELEMETRY_COLLECTOR = 'off';
  assert.equal((await call('POST', '/api/v1/telemetry/ping', null, ping('c'.repeat(24)))).status, 404);
  process.env.TELEMETRY_COLLECTOR = old;
});
