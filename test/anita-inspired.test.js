import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, joinGame, assignRoles, winner } from '../src/fun/werewolf.js';
import { clanLevel } from '../src/commands/clan.js';

test('guardian role only appears with 7+ players', () => {
  for (const [n, expect] of [[5, false], [6, false], [7, true], [12, true]]) {
    const gid = 'g' + n; const ps = Array.from({ length: n }, (_, i) => i + '@s.whatsapp.net');
    const g = createGame(gid, ps[0]); ps.slice(1).forEach((p) => joinGame(gid, g, p));
    assignRoles(g);
    assert.equal(Object.values(g.roles).includes('guardian'), expect);
    assert.equal(Object.values(g.roles).filter((r) => r === 'seer').length, 1);
    assert.equal(winner(g), null);
  }
});
test('clan level thresholds', () => {
  assert.equal(clanLevel(0), 1); assert.equal(clanLevel(99), 1); assert.equal(clanLevel(100), 2);
  assert.equal(clanLevel(250), 3); assert.equal(clanLevel(5000), 5);
});

import { today } from '../src/commands/clan.js';
test('clan daily date uses India midnight, not UTC', () => {
  assert.equal(today(Date.parse('2026-10-22T18:29:00Z')), '2026-10-22'); // 23:59 IST
  assert.equal(today(Date.parse('2026-10-22T18:31:00Z')), '2026-10-23'); // 00:01 IST next day
});

import { isWolfSide } from '../src/fun/werewolf.js';
test('sorcerer only with 9+ players and counts for the wolf side', () => {
  for (const [n, expect] of [[8, false], [9, true], [12, true]]) {
    const gid = 's' + n; const ps = Array.from({ length: n }, (_, i) => i + '@s.whatsapp.net');
    const g = createGame(gid, ps[0]); ps.slice(1).forEach((p) => joinGame(gid, g, p));
    assignRoles(g);
    assert.equal(Object.values(g.roles).includes('sorcerer'), expect);
  }
  const g = { roles: { a: 'sorcerer', b: 'villager', c: 'villager' }, alive: new Set(['a', 'b', 'c']) };
  assert.equal(isWolfSide('sorcerer'), true);
  assert.equal(winner(g), null); // a lone sorcerer vs 2 villagers: game goes on, village does not auto-win
  g.alive = new Set(['a', 'b']);
  assert.equal(winner(g), 'werewolves');
  g.alive = new Set(['b', 'c']);
  assert.equal(winner(g), 'village');
});
