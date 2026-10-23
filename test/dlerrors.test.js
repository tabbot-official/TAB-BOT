import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyYtDlpError } from '../src/utils/downloader.js';
test('new download error classes', () => {
  assert.equal(classifyYtDlpError('ERROR: HTTP Error 429: Too Many Requests'), 'RATE_LIMIT');
  assert.equal(classifyYtDlpError('ERROR: This live event will begin in 2 hours'), 'LIVE');
  assert.equal(classifyYtDlpError('ERROR: Requested format is not available'), 'FORMAT');
  assert.equal(classifyYtDlpError('ERROR: This video is DRM protected'), 'DRM');
});
test('old classes keep priority', () => {
  assert.equal(classifyYtDlpError('Private video. Sign in'), 'PRIVATE');
  assert.equal(classifyYtDlpError('Unsupported URL: x'), 'UNSUPPORTED');
  assert.equal(classifyYtDlpError('weird'), 'FAILED');
});
