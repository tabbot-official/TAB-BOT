import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPayload, validatePayload, numberHash, ALLOWED_KEYS} from '../src/telemetry/payload.js';
import {Collector} from '../src/telemetry/collector.js';
import {Telemetry, count} from '../src/telemetry/client.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tel-'));
const mk = (n, extra = {}) => ({v: 1, id: String(n).padStart(24, '0').replace(/[^a-f0-9]/g, 'a').slice(0, 24), ver: '1.7.0', up: 100, on: true, cmds: {ping: 3}, ...extra});

test('payload allowlist: built payload has only allowed keys, no raw number', () => {
  const p = buildPayload({id: 'a'.repeat(24), ver: '1.7.0', up: 55.9, on: true, number: '919876543210', cmds: {ping: 2, 'bad name': 1, x: -3}});
  assert.ok(Object.keys(p).every((k) => ALLOWED_KEYS.includes(k)));
  assert.ok(!JSON.stringify(p).includes('919876543210')); assert.equal(p.nh, numberHash('+91 98765-43210'));
  assert.deepEqual(p.cmds, {ping: 2}); assert.ok(validatePayload(p));
});
test('validatePayload rejects extras and bad shapes', () => {
  const ok = mk(1); assert.ok(validatePayload(ok));
  for (const bad of [{...ok, text: 'hi'}, {...ok, id: 'zz'}, {...ok, up: -1}, {...ok, cmds: {'a b': 1}}, {...ok, cmds: [1]}, {...ok, nh: 'xyz'}, {...ok, on: 'yes'}, null, [], 'x']) assert.equal(validatePayload(bad), null);
});
test('collector: S-ID stable, rate limit, owner pinned from local identity only', async () => {
  const msgs = []; let now = 1e12; const dir = tmp(); const oh = numberHash('919000000001'); const ownerId = mk(2).id;
  const c = new Collector({file: path.join(dir, 'c.json'), ownerHash: oh, ownerInstallId: ownerId, notify: async (m) => { msgs.push(m); return true; }, now: () => now});
  const ownerSid = c.db.installs[ownerId].sid; assert.equal(c.isExempt(ownerSid), true);
  const a = c.ingest(mk(1), '1.1.1.1'); assert.match(a.sid, /^S-[A-Z0-9]{6}$/);
  assert.equal(c.ingest(mk(1), '1.1.1.1').sid, a.sid);
  now += 700000; c.ingest(mk(1, {cmds: {ping: 4}}), '1.1.1.1'); assert.equal(c.db.installs[mk(1).id].cmds.ping, 7);
  assert.equal(c.ingest(mk(2, {nh: oh}), '2.2.2.2').sid, ownerSid); assert.equal(c.db.installs[ownerId].cmds.ping, 3);
  // takeover attempts: attacker knows the number, so knows the hash
  const fake = c.ingest(mk(3, {nh: oh}), '3.3.3.3'); assert.equal(c.isExempt(fake.sid), false); assert.equal(c.db.installs[mk(3).id].owner, false);
  now += 700000; assert.equal(c.ingest(mk(2, {cmds: {evil: 9}}), '2.2.2.2').sid, ownerSid); assert.equal(c.db.installs[ownerId].cmds.evil, undefined); // no nh -> no update
  assert.equal(c.isExempt(a.sid), false); assert.equal(c.ingest({...mk(4), extra: 1}, '4.4.4.4'), null);
  await c.flush(); assert.equal(msgs.length, 2); assert.ok(msgs.every((m) => !m.includes(ownerSid)));
  assert.equal(new Collector({file: path.join(dir, 'c.json'), ownerInstallId: ownerId}).summary().total, 3);
});
test('collector: first-registration race can not steal owner; later local identity change re-pins', () => {
  const dir = tmp(); const oh = numberHash('919000000001');
  const c = new Collector({file: path.join(dir, 'c.json'), ownerHash: oh}); // no local identity yet
  const x = c.ingest(mk(9, {nh: oh}), 'attacker'); assert.equal(c.isExempt(x.sid), false);
  const d = new Collector({file: path.join(dir, 'd.json'), ownerHash: oh, ownerInstallId: mk(5).id}); d.ingest(mk(6, {nh: oh}), 'a');
  assert.equal(Object.values(d.db.installs).filter((i) => i.owner).length, 1);
  d.pinOwner(mk(6).id); assert.equal(d.db.installs[mk(5).id].owner, false); assert.equal(d.db.installs[mk(6).id].owner, true);
});
test('collector: batches bursts, ip rate limit, notification can be off', async () => {
  const msgs = []; const c = new Collector({file: path.join(tmp(), 'c.json'), notify: async (m) => { msgs.push(m); return true; }});
  for (let i = 1; i <= 8; i++) c.ingest(mk(i * 7), 'burst' + i);
  await c.flush(); assert.equal(msgs.length, 1); assert.match(msgs[0], /8 new/);
  const d = new Collector({file: path.join(tmp(), 'd.json')}); let ok = 0; for (let i = 0; i < 70; i++) if (d.ingest(mk(100 + i), 'same-ip')) ok++; assert.equal(ok, 60);
  const e = new Collector({file: path.join(tmp(), 'e.json'), notify: async (m) => { msgs.push(m); return true; }}); e.ingest(mk(500), 'x'); await e.flush(false); assert.equal(msgs.length, 1);
});
test('client: stores S-ID, subtracts sent counts, off switch sends nothing', async () => {
  const dir = tmp(); let calls = 0; let body = null;
  const fetchFn = async (u, o) => { calls++; body = JSON.parse(o.body); return {ok: true, json: async () => ({sid: 'S-ABC234'})}; };
  process.env.TELEMETRY = 'on'; // Tab: opt-in
  const t = new Telemetry({dir, version: '1.7.0', getNumber: () => '919876543210', isOnline: () => true, url: 'http://x', fetchFn});
  count('ping'); count('ping'); count('bad name');
  assert.equal(await t.ping(), 'S-ABC234'); assert.equal(t.sid, 'S-ABC234'); assert.deepEqual(body.cmds, {ping: 2}); assert.ok(validatePayload(body));
  await t.ping(); assert.deepEqual(body.cmds, {});
  process.env.TELEMETRY = 'off'; const before = calls; assert.equal(await t.ping(), null); assert.equal(calls, before); delete process.env.TELEMETRY;
  const down = new Telemetry({dir: tmp(), version: '1', fetchFn: async () => { throw new Error('offline'); }}); assert.equal(await down.ping(), null);
});

test('collector: per-install detail and hash lookup never expose the id or a raw number', () => {
  const dir = tmp(); let now = 1e12; const c = new Collector({file: path.join(dir, 'd.json'), now: () => now});
  const nh = numberHash('919811112222'); const p = mk(5, {nh, cmds: {ping: 4, menu: 2}});
  const sid = c.ingest(p, '1.1.1.1').sid;
  const d = c.detail(sid); assert.equal(d.cmdTotal, 6); assert.equal(d.hasNumberHash, true); assert.deepEqual(d.top[0], ['ping', 4]);
  assert.ok(!JSON.stringify(d).includes(p.id) && !JSON.stringify(d).includes(nh));
  assert.equal(c.detail('S-NOPE'), null);
  assert.deepEqual(c.lookupNumber('+91 98111-12222').matches.map((m) => m.sid), [sid]);
  assert.equal(c.lookupNumber('919800000000').matches.length, 0); assert.equal(c.lookupNumber('').valid, false);
  assert.ok(!JSON.stringify(c.lookupNumber('919811112222')).includes('9811112222'));
});
