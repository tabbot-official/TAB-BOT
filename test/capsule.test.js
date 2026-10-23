import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {Capsules, parseWhen} from '../src/capsule/index.js';
test('parseWhen dates and offsets', () => {
  const now = Date.UTC(2026, 9, 5);
  assert.equal(parseWhen(['1y', 'hi', 'me'], now).rest, 'hi me');
  assert.equal(parseWhen(['1y', 'x'], now).at - now, 365 * 86400000);
  assert.equal(parseWhen(['2027-01-01', 'ny']).at, Date.parse('2027-01-01T09:00:00+05:30'));
  assert.equal(parseWhen(['soon', 'x']), null);
});
test('capsule store allows 2 years, rejects 6, delivers when due', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')), 'c.json'); let t = 1_000_000_000_000; const sent = [];
  const c = new Capsules(f, async (text, to) => { sent.push([text, to]); return true; }, () => t, (x) => 'OPEN ' + x);
  c.create('hello', t + 2 * 365 * 86400000, '919876543210@s.whatsapp.net', 'u');
  assert.throws(() => c.create('x', t + 6 * 365 * 86400000, null, 'u'));
  t += 2 * 365 * 86400000 + 1000; await c.tick();
  assert.equal(sent.length, 1); assert.match(sent[0][0], /OPEN hello/);
});
