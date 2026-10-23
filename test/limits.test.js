import test from 'node:test';
import assert from 'node:assert/strict';
import { limitsText } from '../src/commands/limits.js';
const cfg = { limits: { cooldownMs: 2000, maxJobsPerUser: 2, maxQueue: 10, maxFileBytes: 100 * 1048576, maxVideoHeight: 480, maxDownloadSeconds: 300 } };
test('limits text reflects config and the user', () => {
  const t = limitsText(cfg, { mine: 1 }, '.');
  assert.match(t, /2 s between/); assert.match(t, /100 MB/); assert.match(t, /480p/); assert.match(t, /5 min/);
  assert.match(t, /1 of 2/); assert.match(t, /\.queue/);
});
test('no user data besides own count', () => { assert.doesNotMatch(limitsText(cfg, { mine: 0 }), /@|\+\d{6}/); });
