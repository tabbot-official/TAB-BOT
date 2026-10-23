// Regression: pageMeta without an injected fetchImpl (the production path) must treat 2xx as success.
// v7.2.9 built the response without `ok`, so every 2xx page failed as "HTTP 200". requestImpl stands in for
// the pinned requestPublic; expected values below are written by hand, not derived from the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { pageMeta } from '../src/downloaders/platforms.js';

const html = '<html><head><title>Fallback</title><meta property="og:title" content="Hello &amp; Welcome"><meta property="og:video" content="https://cdn.example/v.mp4"><meta property="og:image" content="https://cdn.example/p.jpg"></head><body>x</body></html>';
const mk = (status, body = '', headers = {}) => { const stream = status >= 300 && status < 400 ? null : Readable.from([Buffer.from(body)]); return { status, headers, stream, finalUrl: 'x' }; };
const fake = (map, calls = []) => async (u) => { calls.push(u); const v = map[u]; if (!v) throw new Error('unexpected url ' + u); return typeof v === 'function' ? v() : v; };

test('2xx page is parsed on the production path (no fetchImpl)', async () => {
  const calls = [];
  const m = await pageMeta('https://pm1.example/a', { requestImpl: fake({ 'https://pm1.example/a': () => mk(200, html) }, calls) });
  assert.equal(m.title, 'Hello & Welcome');
  assert.equal(m.video, 'https://cdn.example/v.mp4');
  assert.equal(m.image, 'https://cdn.example/p.jpg');
  assert.equal(calls.length, 1, 'page fetched once (no second fetch for the body)');
});
test('206 and other 2xx also succeed', async () => {
  const m = await pageMeta('https://pm2.example/a', { requestImpl: fake({ 'https://pm2.example/a': () => mk(206, html) }) });
  assert.equal(m.image, 'https://cdn.example/p.jpg');
});
test('redirect is followed manually and the target is requested through requestImpl', async () => {
  const calls = [];
  const m = await pageMeta('https://pm3.example/a', { requestImpl: fake({ 'https://pm3.example/a': mk(301, '', { location: '/b' }), 'https://pm3.example/b': () => mk(200, html) }, calls) });
  assert.deepEqual(calls, ['https://pm3.example/a', 'https://pm3.example/b']);
  assert.equal(m.title, 'Hello & Welcome');
});
test('redirect loop stops after 4 hops with an error', async () => {
  const calls = [];
  await assert.rejects(pageMeta('https://pm4.example/a', { requestImpl: fake({ 'https://pm4.example/a': mk(302, '', { location: '/a' }) }, calls) }));
  assert.ok(calls.length >= 4 && calls.length <= 12 && calls.length % 4 === 0, 'bounded: 4 hops per user-agent attempt, got ' + calls.length);
});
test('status mapping: 404 final, 429 final, 403 login, 500 http', async () => {
  await assert.rejects(pageMeta('https://pm5.example/a', { requestImpl: fake({ 'https://pm5.example/a': () => mk(404, 'x') }) }), /content not found or deleted/);
  await assert.rejects(pageMeta('https://pm6.example/a', { requestImpl: fake({ 'https://pm6.example/a': () => mk(429, 'x') }) }), /rate limited/);
  await assert.rejects(pageMeta('https://pm7.example/a', { requestImpl: fake({ 'https://pm7.example/a': () => mk(403, 'x') }) }), /login or access required/);
  await assert.rejects(pageMeta('https://pm8.example/a', { requestImpl: fake({ 'https://pm8.example/a': () => mk(500, 'x') }) }), /HTTP 500/);
});
test('2xx page without media meta is rejected, not cached', async () => {
  await assert.rejects(pageMeta('https://pm9.example/a', { requestImpl: fake({ 'https://pm9.example/a': () => mk(200, '<html><title>t</title></html>') }) }), /page has no public media/);
});
test('non-2xx response bodies are drained (no leaked sockets)', async () => {
  const r = mk(500, 'x'.repeat(1000));
  await assert.rejects(pageMeta('https://pm10.example/a', { requestImpl: fake({ 'https://pm10.example/a': () => r }) }), /HTTP 500/);
  assert.equal(r.stream.readableFlowing, true);
});
test('oversize body is capped at 1.5 MB; early meta still parsed and stream destroyed', async () => {
  const big = html + 'z'.repeat(3_000_000);
  const r = mk(200, big);
  const m = await pageMeta('https://pm11.example/a', { requestImpl: fake({ 'https://pm11.example/a': () => r }) });
  assert.equal(m.image, 'https://cdn.example/p.jpg');
  assert.equal(r.stream.destroyed, true);
});
test('fetchImpl path unchanged', async () => {
  const m = await pageMeta('https://pm12.example/a', { fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => html }) });
  assert.equal(m.video, 'https://cdn.example/v.mp4');
});
