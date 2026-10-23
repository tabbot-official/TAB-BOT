import test from 'node:test';
import assert from 'node:assert/strict';
import { suggest, distance } from '../src/utils/suggest.js';
const cmds = [{ name: 'sticker' }, { name: 'stock' }, { name: 'menu', aliases: ['help2'] }, { name: 'ping' }, { name: 'sid', ownerOnly: true }, { name: 'apikey', requiredLevel: 'owner' }];
test('distance', () => { assert.equal(distance('ping', 'pnig'), 2); assert.equal(distance('a', 'a'), 0); });
test('typos suggest', () => {
  assert.deepEqual(suggest('stikcer', cmds), ['sticker']);
  assert.deepEqual(suggest('pign', cmds), ['ping']);
  assert.deepEqual(suggest('mneu', cmds), ['menu']);
});
test('no noise and never owner-only', () => {
  assert.deepEqual(suggest('zzzzzz', cmds), []);
  assert.deepEqual(suggest('ab', cmds), []);
  assert.deepEqual(suggest('sidd', cmds), []);
  assert.deepEqual(suggest('apikeyy', cmds), []);
});
