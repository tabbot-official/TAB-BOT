import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanTopic, allowed, buildPrompt} from '../src/debate/index.js';
test('debate topic filter and prompt', () => {
  assert.equal(allowed('chai vs coffee'), true);
  assert.equal(allowed('porn'), false);
  assert.equal(allowed('ab'), false);
  assert.equal(cleanTopic('  a   b  ').length, 3);
  assert.match(buildPrompt('x y z'), /family-friendly/);
  assert.match(buildPrompt('x y z', 'Hindi'), /Reply in Hindi/);
});
