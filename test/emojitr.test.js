import test from 'node:test';
import assert from 'node:assert/strict';
import {isMostlyEmoji, cleanEncoded, emojiCount} from '../src/emojitr/index.js';
test('emoji helpers', () => {
  assert.equal(isMostlyEmoji('🍕❤️😋'), true); assert.equal(isMostlyEmoji('I love pizza'), false); assert.equal(isMostlyEmoji('hi 🍕'), false);
  assert.equal(cleanEncoded('Sure! 😍🍕'), '😍🍕'); assert.equal(cleanEncoded('no emoji here'), null); assert.ok(emojiCount('a😀b😀') === 2);
});
