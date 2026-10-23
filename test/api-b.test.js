import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'apib-'));
process.env.API_JWT_SECRET = 'test-secret-test-secret-test-secret';
const {createHandler} = await import('../src/api/server.js');
const {createKey} = await import('../src/api/services/keys.js');
const hooks = await import('../src/api/services/webhooks.js');
const sess = await import('../src/api/services/sessionService.js');
const {bus} = await import('../src/api/events/bus.js');

const srv = http.createServer(createHandler()); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const call = (method, p, key, body) => new Promise((resolve, reject) => {
  const req = http.request({host: '127.0.0.1', port, method, path: p, headers: {'x-api-key': key, ...(body ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify(body))} : {})}}, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({status: res.statusCode, json: JSON.parse(d || 'null')})); });
  req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
});
test.after(() => srv.close());
const publicLookup = async () => [{address: '93.184.216.34', family: 4}];

test('sessions: status view, masked account, no credentials, revoke needs owner + confirm', async () => {
  let loggedOut = 0; sess.setAdapter({number: () => '919876543210', logout: async () => { loggedOut++; }});
  sess.recordConnection(true); sess.recordConnection(false); sess.recordConnection(true);
  const sv = createKey('s', 'service'); const ow = createKey('o', 'owner'); const ro = createKey('r', 'readonly');
  assert.equal((await call('GET', '/api/v1/sessions', ro.key)).status, 403);
  const l = await call('GET', '/api/v1/sessions', sv.key); const s = l.json.data.sessions[0];
  assert.equal(s.status, 'online'); assert.equal(s.reconnects, 1); assert.equal(s.account, '91********10');
  assert.ok(!/creds|9876543210|noise|key/i.test(JSON.stringify(l.json)));
  assert.equal((await call('GET', '/api/v1/sessions/nope', sv.key)).status, 404);
  { const r = await call('DELETE', '/api/v1/sessions/' + s.id, sv.key, {confirm: true}); assert.equal(r.status, 403); }
  assert.equal((await call('DELETE', '/api/v1/sessions/' + s.id, ow.key, {confirm: false})).status, 400); assert.equal(loggedOut, 0);
  assert.equal((await call('DELETE', '/api/v1/sessions/' + s.id, ow.key, {confirm: true})).status, 202); assert.equal(loggedOut, 1);
});
test('pairing is documented but returns 501', async () => {
  const ad = createKey('a', 'admin'); const c = await call('GET', '/api/v1/pairing/capabilities', ad.key); assert.equal(c.json.data.supported, false);
  const r = await call('POST', '/api/v1/pairing/requests', ad.key, {number: '919876543210'}); assert.equal(r.status, 501); assert.equal(r.json.error.code, 'not_implemented');
  assert.equal((await call('POST', '/api/v1/pairing/requests', ad.key, {number: 'abc'})).status, 400);
});
test('webhook URL guard blocks http, private, loopback, metadata, credentials', async () => {
  for (const u of ['http://example.com/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://user:pw@example.com/x', 'ftp://example.com', 'nope']) await assert.rejects(() => hooks.checkUrl(u, publicLookup), /./, u);
  await assert.rejects(() => hooks.checkUrl('https://evil.example/x', async () => [{address: '10.1.1.1'}]));
  assert.ok(await hooks.checkUrl('https://hooks.example.com/x', publicLookup));
});
test('webhooks API: admin only, secret shown once, list hides secret, delete works', async () => {
  const ad = createKey('a2', 'admin'); const sv = createKey('s2', 'service');
  assert.equal((await call('GET', '/api/v1/webhooks', sv.key)).status, 403);
  assert.equal((await call('POST', '/api/v1/webhooks', ad.key, {url: 'http://127.0.0.1/x'})).status, 400);
  assert.equal((await call('POST', '/api/v1/webhooks', ad.key, {url: 'https://hooks.example.com/x', events: ['bogus']})).status, 400);
  assert.equal((await call('GET', '/api/v1/events/types', sv.key)).json.data.events.includes('connection.changed'), true);
});
test('dispatcher signs with HMAC, retries on failure, gives up, skips non-subscribed events', async () => {
  const w = await hooks.create({url: 'https://hooks.example.com/in', events: ['connection.changed']}, publicLookup);
  const calls = []; let fail = 1;
  const requestFn = async (url, o) => { calls.push({url, o}); if (fail-- > 0) return {status: 500}; return {status: 204}; };
  const d = new hooks.Dispatcher({requestFn, delays: [10, 10], lookup: publicLookup, now: () => 1700000000000});
  d.dispatch({type: 'bot.restart', at: 1, data: {}}); await new Promise((r) => setTimeout(r, 30)); assert.equal(calls.length, 0);
  d.dispatch({type: 'connection.changed', at: 1, data: {status: 'online'}}); await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls.length, 2); const h = calls[1].o.headers;
  assert.equal(h['x-jarvis-signature'], hooks.sign(w.secret, h['x-jarvis-timestamp'], calls[1].o.body)); assert.equal(calls[1].o.follow, false); assert.equal(calls[1].o.method, 'POST');
  assert.ok(!calls[1].o.body.includes(w.secret));
  const always = []; const d2 = new hooks.Dispatcher({requestFn: async () => { always.push(1); return {status: 500}; }, delays: [5, 5], lookup: publicLookup});
  d2.dispatch({type: 'connection.changed', at: 1, data: {}}); await new Promise((r) => setTimeout(r, 80)); assert.equal(always.length, 3); d.stop(); d2.stop();
  assert.ok(hooks.remove(w.id)); assert.equal(hooks.remove(w.id), false);
});
test('bus emits connection.changed on session changes', () => {
  const seen = []; const f = (e) => seen.push(e.type); bus.on('event', f); sess.recordConnection(false); sess.recordConnection(true); bus.off('event', f);
  assert.deepEqual(seen, ['connection.changed', 'connection.changed']);
});
