import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'api-'));
process.env.API_JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.API_CORS_ORIGINS = 'https://panel.example.com';
const {createHandler} = await import('../src/api/server.js');
const {createKey, findKey, revokeKey} = await import('../src/api/services/keys.js');
const {sign, verify} = await import('../src/api/services/jwt.js');
const {redact} = await import('../src/api/logger.js');
const {buildSpec} = await import('../src/api/openapi.js');
const {buildRouter} = await import('../src/api/routes.js');

const srv = http.createServer(createHandler()); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const call = (method, p, {headers = {}, body} = {}) => new Promise((resolve, reject) => {
  const req = http.request({host: '127.0.0.1', port, method, path: p, headers: {...(body ? {'content-type': 'application/json'} : {}), ...headers}}, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { /* html */ } resolve({status: res.statusCode, headers: res.headers, json: j, text: d}); }); });
  req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
});
test.after(() => srv.close());

test('envelope, security headers, 404/405', async () => {
  const h = await call('GET', '/api/v1/health'); assert.equal(h.status, 200); assert.equal(h.json.success, true); assert.equal(h.json.data.status, 'ok');
  assert.equal(h.headers['x-content-type-options'], 'nosniff'); assert.ok(h.headers['x-request-id']);
  const n = await call('GET', '/api/v1/nope'); assert.equal(n.status, 404); assert.equal(n.json.success, false); assert.equal(n.json.error.code, 'not_found');
  assert.equal((await call('POST', '/api/v1/health')).status, 405);
});
test('auth: no key 401, bad key 401, key works, JWT exchange works, expired/forged JWT rejected', async () => {
  assert.equal((await call('GET', '/api/v1/bot/status')).status, 401);
  assert.equal((await call('GET', '/api/v1/bot/status', {headers: {'x-api-key': 'jv_wrong_wrong_wrong_wrong'}})).status, 401);
  const k = createKey('t', 'readonly');
  const s = await call('GET', '/api/v1/bot/status', {headers: {'x-api-key': k.key}}); assert.equal(s.status, 200); assert.equal(typeof s.json.data.online, 'boolean'); assert.ok(s.json.data.version);
  const t = await call('POST', '/api/v1/auth/token', {headers: {'x-api-key': k.key}, body: {}}); assert.equal(t.status, 200); assert.equal(t.json.data.role, 'readonly');
  assert.equal((await call('GET', '/api/v1/auth/me', {headers: {authorization: 'Bearer ' + t.json.data.token}})).json.data.role, 'readonly');
  assert.equal((await call('GET', '/api/v1/auth/me', {headers: {authorization: 'Bearer ' + sign({sub: 'x', role: 'owner'}, -10)}})).status, 401);
  const forged = sign({sub: 'x', role: 'readonly'}).split('.'); forged[1] = Buffer.from(JSON.stringify({sub: 'x', role: 'owner', exp: 9e9})).toString('base64url');
  assert.equal(verify(forged.join('.')), null); assert.equal((await call('GET', '/api/v1/auth/me', {headers: {authorization: 'Bearer ' + forged.join('.')}})).status, 401);
});
test('RBAC: readonly cannot see runtime/keys/restart; owner restart needs confirm', async () => {
  const ro = createKey('ro', 'readonly'); const sv = createKey('sv', 'service'); const ow = createKey('ow', 'owner'); const ad = createKey('ad', 'admin');
  assert.equal((await call('GET', '/api/v1/bot/runtime', {headers: {'x-api-key': ro.key}})).status, 403);
  assert.equal((await call('GET', '/api/v1/bot/runtime', {headers: {'x-api-key': sv.key}})).status, 200);
  assert.equal((await call('GET', '/api/v1/keys', {headers: {'x-api-key': sv.key}})).status, 403);
  assert.equal((await call('POST', '/api/v1/bot/restart', {headers: {'x-api-key': ad.key}, body: {confirm: true}})).status, 403);
  assert.equal((await call('POST', '/api/v1/bot/restart', {headers: {'x-api-key': ow.key}, body: {}})).status, 400);
  const list = await call('GET', '/api/v1/keys', {headers: {'x-api-key': ad.key}}); assert.equal(list.status, 200); assert.ok(!JSON.stringify(list.json).includes(ro.key)); assert.ok(!JSON.stringify(list.json).includes('hash'));
  const esc = await call('POST', '/api/v1/keys', {headers: {'x-api-key': ad.key}, body: {name: 'x', role: 'owner'}}); assert.equal(esc.status, 403);
  const mk = await call('POST', '/api/v1/keys', {headers: {'x-api-key': ad.key}, body: {name: 'portal', role: 'service'}}); assert.equal(mk.status, 201); assert.ok(findKey(mk.json.data.apiKey));
  assert.equal((await call('DELETE', '/api/v1/keys/' + mk.json.data.id, {headers: {'x-api-key': ad.key}})).status, 200); assert.equal(findKey(mk.json.data.apiKey), null);
});
test('keys are stored hashed only; validation rejects unknown fields and wrong types; body limit', async () => {
  const k = createKey('h', 'admin'); const raw = fs.readFileSync(path.join(process.env.DATA_FOLDER, 'api-keys.json'), 'utf8'); assert.ok(!raw.includes(k.key));
  const hd = {'x-api-key': k.key};
  assert.equal((await call('POST', '/api/v1/keys', {headers: hd, body: {name: 'a', evil: 1}})).status, 400);
  assert.equal((await call('POST', '/api/v1/keys', {headers: hd, body: {name: 5}})).status, 400);
  assert.equal((await call('POST', '/api/v1/keys', {headers: hd, body: {name: 'x'.repeat(20000)}})).status, 413);
  assert.equal(revokeKey('nonexistent'), false);
});
test('CORS only for allowlisted origins; rate limit kicks in', async () => {
  const a = await call('GET', '/api/v1/health', {headers: {origin: 'https://panel.example.com'}}); assert.equal(a.headers['access-control-allow-origin'], 'https://panel.example.com');
  const b = await call('GET', '/api/v1/health', {headers: {origin: 'https://evil.example.com'}}); assert.equal(b.headers['access-control-allow-origin'], undefined);
  let last = 0; for (let i = 0; i < 40; i++) last = (await call('GET', '/api/v1/health')).status; assert.equal(last, 429);
});
test('no credential leak: status/runtime never contain creds/session/number; logs redact', async () => {
  const k = createKey('l', 'service'); const r = JSON.stringify((await call('GET', '/api/v1/bot/runtime', {headers: {'x-api-key': k.key}})).json);
  assert.ok(!/creds|session|noise|jid|@s\.whatsapp/i.test(r));
  const red = redact({authorization: 'Bearer abc', nested: {apiKey: 'jv_x', number: '9198', ok: 'fine'}}); assert.equal(red.authorization, '[redacted]'); assert.equal(red.nested.apiKey, '[redacted]'); assert.equal(red.nested.number, '[redacted]'); assert.equal(red.nested.ok, 'fine');
});
test('OpenAPI is generated from routes and docs page is served', async () => {
  const spec = buildSpec(buildRouter()); assert.ok(spec.paths['/api/v1/bot/status'].get); assert.ok(spec.paths['/api/v1/keys/{id}'].delete);
  const d = await call('GET', '/api/v1/openapi.json'); assert.equal(d.json.openapi, '3.0.3'); const h = await call('GET', '/api/v1/docs'); assert.match(h.text, /swagger-ui/);
});
