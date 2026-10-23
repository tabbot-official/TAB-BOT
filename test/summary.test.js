import test from 'node:test';
import assert from 'node:assert/strict';
import { record, recent, _reset } from '../src/chatlog/index.js';
import { buildPrompt } from '../src/commands/summary.js';
test('chatlog keeps recent messages per chat, bounded', () => {
  _reset();
  for (let i = 0; i < 350; i++) record('g@g.us', 'A', 'msg ' + i);
  assert.equal(recent('g@g.us', 500).length, 300);
  assert.equal(recent('g@g.us', 5).at(-1).text, 'msg 349');
  assert.equal(recent('none@g.us').length, 0);
  record('g@g.us', 'B', 'old', Date.now() - 25 * 3600 * 1000);
  assert.ok(!recent('g@g.us', 300).some((m) => m.text === 'old'));
});
test('prompt contains names and lines', () => {
  const p = buildPrompt([{ who: 'Ravi', text: 'kal 5 baje milte hain' }]);
  assert.match(p, /Ravi: kal 5 baje milte hain/);
});
