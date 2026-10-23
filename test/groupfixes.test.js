import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'));
const {parseDuration, setReopen, dueReopens, clearReopen} = await import('../src/groups/timedmute.js');
const A = await import('../src/groups/activity.js');
test('parseDuration', () => {
  assert.equal(parseDuration('30m'), 1800000); assert.equal(parseDuration('2h'), 7200000);
  assert.equal(parseDuration('1d'), 86400000); assert.equal(parseDuration('abc'), 0); assert.equal(parseDuration('99d'), 0);
});
test('timed reopen', () => {
  setReopen('g1', Date.now() - 1000); setReopen('g2', Date.now() + 99999);
  assert.deepEqual(dueReopens(), ['g1']); clearReopen('g1'); assert.deepEqual(dueReopens(), []);
});
test('activity log', () => {
  const now = Date.now();
  A.record('g', 'a', now); A.record('g', 'a', now); A.record('g', 'b', now - 3 * 86400e3);
  assert.equal(A.topUsers('g', 7, 5, now)[0].user, 'a');
  assert.equal(A.topUsers('g', 1, 5, now).length, 1);
  assert.equal(A.dailyTotals('g', 7, now).reduce((x, y) => x + y.msgs, 0), 3);
  assert.equal(A.lastSeen('g', 'a'), now);
  assert.ok(A.busiestHour('g') !== null);
});
test('warn expiry prune + defaults', async () => {
  const S = await import('../src/groups/store.js');
  await S.initStore();
  const st = S.store();
  st.addWarn('gx', 'u1', 'auto', 'r');
  st.pruneWarns('gx', 'u1', Date.now() + 1000);
  assert.equal(st.listWarns('gx', 'u1').length, 0);
  assert.equal(S.DEFAULTS.warnExpireDays, 30);
  assert.equal(S.DEFAULTS.linkMode, 'all');
});
test('schedule parsing and due logic', async () => {
  const S = await import('../src/groups/scheduler.js');
  assert.deepEqual(S.parseWhen(['9:05', 'hi', 'all']), { hhmm: '09:05', dow: null, date: null, rest: 'hi all' });
  assert.deepEqual(S.parseWhen(['mon,fri', '18:30', 'x']).dow, [1, 5]);
  assert.deepEqual(S.parseWhen(['weekends', '10:00', 'x']).dow, [0, 6]);
  assert.equal(S.parseWhen(['2026-12-31', '23:59', 'ny']).date, '2026-12-31');
  assert.equal(S.parseWhen(['nonsense', 'x']), null);
  // 2026-10-05 is a Monday
  assert.ok(S.dueNow({ hhmm: '09:00', dow: [1] }, '09:00', '2026-10-05'));
  assert.ok(!S.dueNow({ hhmm: '09:00', dow: [2] }, '09:00', '2026-10-05'));
  assert.ok(!S.dueNow({ hhmm: '09:00', date: '2026-10-06' }, '09:00', '2026-10-05'));
  assert.ok(S.dueNow({ hhmm: '09:00' }, '09:00', '2026-10-05'));
});
test('media key for spam', async () => {
  const { mediaKey } = await import('../src/groups/moderation.js');
  assert.equal(mediaKey({ stickerMessage: { fileSha256: Buffer.from('abc') } }), 'media:YWJj');
  assert.equal(mediaKey({ conversation: 'x' }), '');
});
