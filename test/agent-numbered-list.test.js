import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNumberedList } from '../src/commands/agent.js';
// Input is what WhatsApp args give the command: whitespace-collapsed (newlines become spaces).
const goal21 = 'download all the songs individually from the playlist given by me 1. afran jalebi 2. Lal pari 3. Awarapan 4. Phir se 5. Aawaara angaara 6. Hale dil 7. Deewana kar raha hai 8. Shayad 9. Titli 10. Tera ban jaunga 11. Khairiyat 12. Ahista 13. Sanam teri kasam 14. pehle bhi main 15.bandeya 16.samjhawan 17.arz kiya hai 18.baaton ko teri 19.sanson kj mala 20. Parda hata do jara mukhra dikha do 21. Tere liye';
test('21-item list from the real report is fully extracted, in order, nothing dropped', () => {
  const l = extractNumberedList(goal21).items;
  assert.equal(l.length, 21);
  assert.equal(l[0], 'afran jalebi'); assert.equal(l[14], 'bandeya'); assert.equal(l[19], 'Parda hata do jara mukhra dikha do'); assert.equal(l[20], 'Tere liye');
});
test('the old 300-char cut would have kept only 15-16 items (documents the bug)', () => {
  assert.ok(goal21.length > 300);
  const r = extractNumberedList(goal21.slice(0, 300));
  assert.ok(r.items.length < 21 && r.items.length >= 14);
});
test('huge list: 5000 items extracted exactly', () => {
  const g = 'download ' + Array.from({ length: 5000 }, (_, i) => `${i + 1}. song number ${i + 1}`).join(' ');
  const l = extractNumberedList(g).items;
  assert.equal(l.length, 5000); assert.equal(l[4999], 'song number 5000');
});
test('non-lists are not treated as lists', () => {
  assert.deepEqual(extractNumberedList('download arijit singh love songs').items, []);
  assert.equal(extractNumberedList('top 10. best songs of 2020. and 3. more').clean, false);
  assert.deepEqual(extractNumberedList('1. only one 2. two').items, []);
  assert.deepEqual(extractNumberedList('play 3.5 hours of music 1. a 2. b').items, []);
});
test('one per line (newlines kept) also works', () => {
  assert.deepEqual(extractNumberedList('get these\n1. a b\n2) c\n3. d').items, ['a b', 'c', 'd']);
});
test('gaps and repeats are reported, never silently merged into a clean list', () => {
  const gap = extractNumberedList('download 1. a 2. b 4. d 5. e');
  assert.equal(gap.clean, false); assert.equal(gap.items.length, 0); assert.equal(gap.markers, 4);
  const dup = extractNumberedList('download 1. a 2. b 2. c 3. d');
  assert.equal(dup.clean, false); assert.ok(dup.markers >= 4);
});
test('prose with numbers is not a clean list', () => {
  const r = extractNumberedList('download songs from 2019. then in 2020. send me the top 5. ones');
  assert.equal(r.clean, false); assert.deepEqual(r.items, []);
});
test('/agent rejects an oversize request explicitly before planning (no silent truncation)', async () => {
  const agent = (await import('../src/commands/agent.js')).default;
  const out = [];
  await agent.run({ args: ['x'.repeat(20001)], reply: async (t) => { out.push(String(t)); }, msg: { key: {}, message: {} }, jid: 'j@s.whatsapp.net', sender: '1' });
  assert.match(out[0], /20001 characters.*limit is 20000.*Nothing was started/);
  assert.equal(out.length, 1);
});
