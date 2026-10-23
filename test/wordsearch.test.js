import test from 'node:test';
import assert from 'node:assert/strict';
import game, { createWordsearch } from '../src/games/brain/wordsearch.js';
import { GameSessionManager } from '../src/games/GameSessionManager.js';
import { GameEngine } from '../src/games/GameEngine.js';
const answer = s => `${s.row} ${s.col} ${s.endRow} ${s.endCol}`;
function rng(seed) { return max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }; }

test('wordsearch generates 600 bounded solvable independent grids across levels', () => {
  for (const level of ['easy', 'medium', 'hard']) for (let seed = 1; seed <= 200; seed++) {
    const s = createWordsearch(level, { rng: rng(seed) });
    assert.equal(s.grid.length, s.size);
    assert.ok(s.grid.every(row => row.length === s.size && row.every(c => /^[A-Z]$/.test(c))));
    assert.equal(game.move(s, answer(s)).won, true);
    const other = createWordsearch(level, { rng: rng(seed) });
    assert.equal(other.attempts.length, 0);
    s.grid[0][0] = '!'; assert.notEqual(other.grid[0][0], '!');
  }
  assert.throws(() => game.create('invalid'), /Choose/);
});

test('wordsearch rejects malformed, out of bounds and impossible lines without spending attempts', () => {
  const s = createWordsearch('easy', { rng: () => 0 });
  for (const x of ['', '1 2', '1,2,3,4', '0 1 1 4', '99 1 1 4', '-1 1 1 4', '1.5 1 1 4', '1 1 2 3', '1 1 1 2', '1 1 1 1', '1 1 1 4 extra', '1'.repeat(10000)]) assert.throws(() => game.move(s, x));
  assert.equal(s.attempts.length, 0);
});

test('wordsearch counts wrong guesses, rejects duplicates and ends after limit', () => {
  const s = createWordsearch('easy', { rng: () => 0 });
  for (let row = 1; row <= 6; row++) {
    const line = `${row} 2 ${row} 5`;
    const r = game.move(s, line);
    assert.equal(r.won, false); assert.equal(r.done, row === 6);
    assert.throws(() => game.move(s, line), /Already/);
  }
});

test('wordsearch accepts alternate occurrences and all eight directions', () => {
  for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1],[0,-1],[-1,0],[-1,-1],[-1,1]]) {
    const s = { size: 5, word: 'BIRD', grid: Array.from({length:5}, () => Array(5).fill('X')), attempts: [], maxAttempts: 5, row: 1, col: 1, endRow: 1, endCol: 4 };
    const r = dr < 0 ? 4 : 0, c = dc < 0 ? 4 : 0;
    for(let i=0;i<4;i++)s.grid[r+dr*i][c+dc*i]=s.word[i];
    assert.equal(game.move(s,`${r+1} ${c+1} ${r+dr*3+1} ${c+dc*3+1}`).won,true);
  }
});

test('wordsearch engine isolates players and chats, awards once, cancels and expires without XP', async () => {
  let now = 0, awards = 0; const out = [];
  const sessions = new GameSessionManager({ now: () => now });
  const engine = new GameEngine({ sessions, brain: new Map([['wordsearch', game]]), now: () => now, progression: { finish: () => { awards++; return [10]; } } });
  sessions.onExpire = s => engine.expire(s);
  const ctx = { jid: 'chat', senderJid: 'player', reply: async x => out.push(x) };
  const s = await engine.start(ctx, 'wordsearch');
  await assert.rejects(engine.answer({...ctx,senderJid:'other'},'wordsearch',answer(s.state)),/Start/);
  await assert.rejects(engine.answer({...ctx,jid:'other'},'wordsearch',answer(s.state)),/Start/);
  now = 4000; await engine.answer(ctx,'wordsearch',answer(s.state)); assert.equal(awards,1);
  await assert.rejects(engine.answer(ctx,'wordsearch',answer(s.state)),/Start/); assert.equal(awards,1);
  now = 8000; const cancel = await engine.start(ctx,'wordsearch'); await engine.cancel(ctx); assert.equal(sessions.sessions.has(cancel.id),false); assert.equal(awards,1);
  now = 12000; const expiry = await engine.start(ctx,'wordsearch'); now = expiry.expires + 1; sessions.prune();
  await new Promise(r=>setImmediate(r)); assert.match(out.at(-1),/expired/); assert.equal(awards,1); assert.equal(engine.notifications.size,0);
  sessions.close();
});

test('wordsearch render has bounded aligned grid and explicit coordinate help', () => {
  for (const level of ['easy','medium','hard']) {
    const s = game.create(level), text = game.render(s);
    assert.match(text,/Rows and columns start at 1/); assert.match(text,/ROW COL ROW COL/);
    assert.ok(text.length < 1700); const rows = text.split('```')[1].trimEnd().split('\n').filter(Boolean);
    assert.equal(rows.length,s.size+1);
    assert.ok(rows.slice(1).every(row=>row.length === rows[1].length));
  }
});
