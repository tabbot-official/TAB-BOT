import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseDate, Birthdays, PER_CHAT} from '../src/birthday/index.js';

test('parseDate formats and validation', () => {
  assert.deepEqual(parseDate('14-03'), {day: 14, month: 3}); assert.deepEqual(parseDate('2 Nov'), {day: 2, month: 11});
  assert.deepEqual(parseDate('march 5th'), {day: 5, month: 3}); assert.deepEqual(parseDate('14/3/1999'), {day: 14, month: 3});
  assert.equal(parseDate('31-02'), null); assert.equal(parseDate('hello'), null); assert.equal(parseDate('0-1'), null);
});
test('wishes once per year from 9 AM IST, reminder in DMs, retries on failed send', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bd-')), 'b.json'); const sent = []; let ok = true;
  let now = Date.parse('2026-03-14T08:00:00+05:30');
  const b = new Birthdays(f, async (to, text, m) => { if (!ok) return false; sent.push({to, text, m}); return true; }, () => now);
  b.add({chat: '1-2@g.us', name: 'Asha', day: 14, month: 3, who: '911234567890'});
  b.add({chat: '919999999999@s.whatsapp.net', name: 'Mom', day: 14, month: 3});
  b.add({chat: '1-2@g.us', name: 'Other', day: 15, month: 3});
  assert.equal(await b.tick(), 0);
  now = Date.parse('2026-03-14T09:05:00+05:30'); ok = false; assert.equal(await b.tick(), 0);
  ok = true; assert.equal(await b.tick(), 2); assert.equal(await b.tick(), 0);
  assert.match(sent.find((x) => x.to.endsWith('@g.us')).text, /@911234567890/); assert.deepEqual(sent.find((x) => x.to.endsWith('@g.us')).m, ['911234567890@s.whatsapp.net']);
  assert.match(sent.find((x) => !x.to.endsWith('@g.us')).text, /Reminder.*Mom/);
  now = Date.parse('2027-03-14T10:00:00+05:30'); assert.equal(await b.tick(), 2);
  assert.equal(new Birthdays(f, async () => true).items.length, 3);
});
test('limits, replace by name, remove, Feb 29 on non-leap year', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bd-')), 'b.json');
  const b = new Birthdays(f, async () => true, () => Date.parse('2027-02-28T10:00:00+05:30'));
  for (let i = 0; i < PER_CHAT; i++) b.add({chat: 'c@g.us', name: 'n' + i, day: 1, month: 1});
  assert.throws(() => b.add({chat: 'c@g.us', name: 'x', day: 1, month: 1}), /chat_full/);
  b.add({chat: 'd@g.us', name: 'Leap', day: 29, month: 2}); b.add({chat: 'd@g.us', name: 'leap', day: 5, month: 5});
  assert.equal(b.inChat('d@g.us').length, 1); b.add({chat: 'd@g.us', name: 'Leap2', day: 29, month: 2});
  assert.equal(await b.tick(), 1); assert.ok(b.remove('d@g.us', 'leap2')); assert.equal(b.remove('d@g.us', 'nope'), null);
  assert.throws(() => b.add({chat: 'd@g.us', name: '  ', day: 1, month: 1}), /name/);
});
