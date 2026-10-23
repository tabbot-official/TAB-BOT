import test from 'node:test';
import assert from 'node:assert/strict';
import {heuristics, extractUrl, isPrivateIp} from '../src/linksafe/index.js';
test('flags bad links', () => {
  assert.ok(heuristics('http://192.168.1.5/login').score >= 4);
  assert.ok(heuristics('https://paypal.verify-now.xyz/login').score >= 5);
  assert.ok(heuristics('https://github.com/x').score < 2);
});
test('extract + private ip', () => {
  assert.equal(extractUrl('see https://a.com/x, ok'), 'https://a.com/x');
  assert.ok(isPrivateIp('10.0.0.1') && !isPrivateIp('8.8.8.8'));
});
