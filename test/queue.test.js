import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadQueue } from '../src/utils/downloader.js';
// /queue became the owner's persistent command queue (v6.x); download queue positions are still reported
// through DownloadQueue.userStatus (used by /limits), so this file covers that contract directly.
test('empty and idle', () => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 5, maxPerUser: 2 });
  const s = q.userStatus('a');
  assert.equal(s.mine, 0); assert.equal(s.running, 0); assert.equal(s.waiting, 0);
});
test('running then waiting positions', async () => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 5, maxPerUser: 2 });
  let release; const gate = new Promise((r) => { release = r; });
  const p1 = q.add('a', () => gate);
  const p2 = q.add('b', async () => 1, () => {});
  const sa = q.userStatus('a'), sb = q.userStatus('b'), sc = q.userStatus('c');
  assert.equal(sa.mine, 1); assert.equal(sa.position, 0); assert.equal(sa.running, 1);
  assert.equal(sb.mine, 1); assert.equal(sb.position, 1); assert.equal(sb.waiting, 1);
  assert.equal(sc.mine, 0); assert.equal(sc.running, 1); assert.equal(sc.waiting, 1);
  release(); await p1; await p2;
  assert.equal(q.userStatus('a').mine, 0);
});
