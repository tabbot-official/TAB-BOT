import test from 'node:test';
import assert from 'node:assert/strict';
import { REACTIONS, reactionList, resolveReaction, fetchReactionGif, downloadGif, gifToMp4, buildCaption } from '../src/fun/reactions.js';
import fs from 'node:fs/promises';

test('reaction whitelist is platonic and every type has a provider', () => {
  const banned = ['kiss', 'lick', 'bite', 'neko', 'waifu', 'foxgirl', 'fox_girl', 'meow', 'woof', 'goose', 'lizard', 'nom', 'yeet', 'kill', 'bully', 'glomp', 'handhold', 'wink', 'smug', 'awoo', 'spank', 'shinobu', 'megumin', 'cringe', 'kick'];
  for (const t of reactionList()) {
    assert.ok(!banned.includes(t), 'suggestive/ambiguous category present: ' + t);
    const def = REACTIONS[t];
    assert.ok(def.waifu || def.nekos, 'no provider for ' + t);
    for (const p of ['waifu', 'nekos']) if (def[p]) assert.match(def[p], /^[a-z_]{2,20}$/, 'unsafe category for ' + t);
    assert.ok(def.verb && def.emoji);
  }
});

test('resolveReaction only accepts whitelisted names', () => {
  assert.equal(resolveReaction('HUG'), 'hug');
  assert.equal(resolveReaction('kiss'), null);
  assert.equal(resolveReaction("hug'); DROP TABLE--"), null);
  assert.equal(resolveReaction(''), null);
});

test('fetchReactionGif falls back to the second provider and never takes user input', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (seen.length === 1) throw new Error('provider 1 down');
    return { status: 200, body: Buffer.from(JSON.stringify({ url: 'https://cdn.nekos.life/hug/hug_054.gif' })) };
  };
  const r = await fetchReactionGif('hug', { fetchImpl });
  assert.equal(r.provider, 'nekos');
  assert.deepEqual(seen, ['https://api.waifu.pics/sfw/hug', 'https://nekos.life/api/v2/img/hug']);
  for (const u of seen) assert.match(u, /^https:\/\/(api\.waifu\.pics|nekos\.life)\/[a-z/_0-9]+$/);
});

test('downloadGif rejects non-GIF bytes and non-whitelisted hosts', async () => {
  await assert.rejects(() => downloadGif('https://evil.example.com/x.gif', { fetchImpl: async () => ({ status: 200, body: Buffer.from('GIF89a....') }) }), /not allowed/);
  await assert.rejects(() => downloadGif('https://cdn.nekos.life/a.gif', { fetchImpl: async () => ({ status: 200, body: Buffer.from('<html>nope</html>') }) }), /Not a GIF/);
  const ok = await downloadGif('https://cdn.nekos.life/hug/hug_054.gif', { fetchImpl: async () => ({ status: 200, body: Buffer.from('GIF89a' + 'x'.repeat(100)) }) });
  assert.ok(ok.length > 100);
});

// 1x1 transparent GIF89a fixture, generated locally (no network).
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

test('gifToMp4 produces a validated MP4 from GIF bytes', async () => {
  const workDir = await fs.mkdtemp('/tmp/react-test-');
  try {
    const mp4 = await gifToMp4(TINY_GIF, { workDir });
    assert.equal(mp4.subarray(4, 8).toString('ascii'), 'ftyp');
    assert.ok(mp4.length > 200);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
});

test('buildCaption mentions only resolved JIDs', () => {
  const solo = buildCaption('hug', '9162@s.whatsapp.net', null);
  assert.deepEqual(solo.mentions, ['9162@s.whatsapp.net']);
  assert.match(solo.caption, /^@9162 hugs everyone/);
  const duo = buildCaption('pat', '1@s.whatsapp.net', '2@s.whatsapp.net');
  assert.deepEqual(duo.mentions, ['1@s.whatsapp.net', '2@s.whatsapp.net']);
  assert.match(duo.caption, /^@1 pats @2/);
  const self = buildCaption('bonk', '1@s.whatsapp.net', '1@s.whatsapp.net');
  assert.deepEqual(self.mentions, ['1@s.whatsapp.net']);
});
