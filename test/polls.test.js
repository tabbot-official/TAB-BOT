import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'));
const P = await import('../src/polls/index.js');
const h = (s) => crypto.createHash('sha256').update(Buffer.from(s)).digest();
const upd = (voter, ...opts) => ({ pollUpdateMessageKey: { participant: voter + '@s.whatsapp.net', remoteJid: 'g@g.us' }, vote: { selectedOptions: opts.map(h) } });
test('latest vote per voter wins, tally, winner', () => {
  P._reset();
  const id = P.register({ key: { id: 'P1' }, message: { pollCreationMessage: {} } }, { jid: 'g@g.us', name: 'Pizza?', options: ['Yes', 'No'], creator: '1' });
  P.applyUpdates(id, [upd('1', 'Yes'), upd('2', 'No'), upd('3', 'Yes')]);
  P.applyUpdates(id, [upd('2', 'Yes')]); // 2 changes vote
  const c = P.tally(P.get(id));
  assert.deepEqual([c.Yes.length, c.No.length], [3, 0]);
  assert.match(P.formatResult(P.get(id)), /Winner: \*Yes\*/);
  P.applyUpdates(id, [upd('1')]); P.applyUpdates(id, [upd('2')]); P.applyUpdates(id, [upd('3', 'No')]);
  assert.match(P.formatResult(P.get(id)), /Winner: \*No\*/);
});
test('tie, no votes, duration parse, close once', async () => {
  P._reset();
  const id = P.register({ key: { id: 'P2' }, message: {} }, { jid: 'g@g.us', name: 'Q', options: ['A', 'B'] });
  assert.match(P.formatResult(P.get(id)), /No votes yet/);
  P.applyUpdates(id, [upd('1', 'A'), upd('2', 'B')]); assert.match(P.formatResult(P.get(id)), /Tie/);
  assert.equal(P.parseDuration('10m'), 600000); assert.equal(P.parseDuration('2h'), 7200000); assert.equal(P.parseDuration('0'), 0); assert.equal(P.parseDuration('9999m'), 0);
  const sent = []; const sock = { sendMessage: async (j, c) => sent.push(c.text) };
  assert.equal(await P.closePoll(sock, id), true); assert.equal(await P.closePoll(sock, id), false);
  assert.equal(sent.length, 1); assert.match(sent[0], /Poll closed/);
  assert.equal(P.applyUpdates(id, [upd('9', 'A')]), false);
  assert.ok(P.getPollMessage(id) !== undefined);
});
