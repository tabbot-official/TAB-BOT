import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCrash, readCrashes, loopDelayMs, crashText } from '../src/ops/crashlog.js';
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cr-')), 'crashes.json');
test('records first line only, caps at 20', () => {
  const f = tmp();
  recordCrash(new Error('boom\n    at secret/path.js:1'), { f, now: 1000 });
  assert.equal(readCrashes(f)[0].msg, 'boom');
  for (let i = 0; i < 25; i++) recordCrash('e' + i, { f, now: 2000 + i });
  assert.equal(readCrashes(f).length, 20);
});
test('never throws, tolerates bad file', () => {
  const blocker = tmp(); fs.writeFileSync(blocker, 'x'); recordCrash('x', { f: path.join(blocker, 'sub', 'crashes.json') });
  const f = tmp(); fs.writeFileSync(f, 'not json'); assert.deepEqual(readCrashes(f), []);
});
test('loop guard needs 4 crashes in 5 minutes', () => {
  const now = 1e6;
  assert.equal(loopDelayMs([{ at: now - 1000 }, { at: now - 2000 }, { at: now - 3000 }], now), 0);
  assert.equal(loopDelayMs([1, 2, 3, 4].map((i) => ({ at: now - i * 1000 })), now), 30000);
  assert.equal(loopDelayMs([1, 2, 3, 4].map((i) => ({ at: now - 600000 - i })), now), 0);
});
test('text', () => { assert.match(crashText([]), /No crashes/); assert.match(crashText([{ at: Date.now(), msg: 'boom' }]), /boom/); });
