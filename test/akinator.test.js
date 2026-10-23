import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnswer, parseTurn, start, turn, key, active, _reset} from '../src/akinator/index.js';
test('answers and turns parse', () => {
  assert.equal(parseAnswer('Haan!'), 'yes'); assert.equal(parseAnswer('nahi'), 'no'); assert.equal(parseAnswer('shayad'), 'maybe'); assert.equal(parseAnswer('hello there'), null);
  assert.deepEqual(parseTurn('Q: Is it real?'), {q: 'Is it real?'}); assert.deepEqual(parseTurn('GUESS: **Pikachu**'), {guess: 'Pikachu'}); assert.equal(parseTurn('blah'), null);
});
test('full game with a fake AI: question, answer, guess, win', async () => {
  _reset(); const k = key('chat@s.whatsapp.net', '9199@s.whatsapp.net'); const script = ['Q: Is it a cartoon?', 'GUESS: Mickey Mouse']; let i = 0;
  const ai = async () => ({text: script[i++]});
  let r = await start(k, '', ai); assert.match(r.text, /Q1/);
  assert.equal(await turn(k, 'random chatter', ai), null);
  r = await turn(k, 'yes', ai); assert.match(r.text, /Mickey Mouse/);
  r = await turn(k, 'yes', ai); assert.equal(r.end, true); assert.equal(active(k), null);
});
test('wrong guess three times ends the game; AI failure ends cleanly', async () => {
  _reset(); const k = key('c', 'u'); const ai = async () => ({text: 'GUESS: X'});
  await start(k, '', ai); await turn(k, 'no', ai); await turn(k, 'no', ai); const r = await turn(k, 'no', ai); assert.equal(r.end, true);
  const bad = await start(key('c', 'v'), '', async () => { throw new Error('x'); }); assert.equal(bad.end, true);
});
