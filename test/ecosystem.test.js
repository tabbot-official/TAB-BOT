import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, validatePayload, portalSidHash, ALLOWED_KEYS } from '../src/telemetry/payload.js';
const base = { id: 'a'.repeat(24), ver: '2.0.0', up: 5, on: true, number: '', cmds: {} };
test('portal sid hash is one-way, 16 hex, and only for valid S-IDs', () => {
  const h = portalSidHash('S-7KQ2MX');
  assert.match(h, /^[a-f0-9]{16}$/); assert.ok(!h.includes('7KQ2MX'));
  assert.equal(portalSidHash(''), ''); assert.equal(portalSidHash('hello'), ''); assert.equal(portalSidHash('S-123'), '');
});
test('payload carries ps only when set, and validates', () => {
  assert.equal(buildPayload(base).ps, undefined);
  const p = buildPayload({ ...base, portalSid: 'S-7KQ2MX' });
  assert.equal(p.ps, portalSidHash('S-7KQ2MX')); assert.ok(validatePayload(p));
  assert.ok(ALLOWED_KEYS.includes('ps'));
  assert.equal(validatePayload({ ...p, ps: 'S-7KQ2MX' }), null);
  assert.equal(JSON.stringify(p).includes('7KQ2MX'), false);
});
test('settings: bad sid ignored, number reduced to digits', async () => {
  const { default: cfg } = await import('../src/config/config.js');
  assert.equal(typeof cfg.ecosystem.sid, 'string'); assert.match(cfg.ecosystem.number, /^\d*$/);
});
