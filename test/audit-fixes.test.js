import './_prefix.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localizePrefix } from '../src/utils/prefixText.js';
import { PLACEHOLDER, scrubPlaceholders } from '../src/config/envPlaceholders.js';
import { canonicalSocial } from '../src/downloaders/social.js';
import { sendMediaFile, AUDIO_CONTAINERS } from '../src/utils/sender.js';

const known = (n) => ['riddle', 'menu', 'help', 'play', 'weather'].includes(n);

test('replies written for "/" show the live prefix for known commands only', () => {
  assert.equal(localizePrefix('Answer: /riddle answer TEXT\nCancel: /riddle cancel', '.', known), 'Answer: .riddle answer TEXT\nCancel: .riddle cancel');
  assert.equal(localizePrefix('Unknown command. Use /menu.', '.', known), 'Unknown command. Use .menu.');
  assert.equal(localizePrefix('(/play song) *\/weather*', '.', known), '(.play song) *.weather*');
  assert.equal(localizePrefix('see https://x.com/menu and /tmp/play and a/play', '.', known), 'see https://x.com/menu and /tmp/play and a/play');
  assert.equal(localizePrefix('/notacmd and /play/x', '.', known), '/notacmd and /play/x');
  assert.equal(localizePrefix('Use /menu', '/', known), 'Use /menu'); // "/" prefix: unchanged
  assert.equal(localizePrefix(undefined, '.', known), undefined);
});

test('untouched .env.example placeholders count as unset', () => {
  for (const v of ['your-giphy-beta-key', 'your-botfather-token', 'change-me-long-random-string', '91XXXXXXXXXX']) assert.match(v, PLACEHOLDER);
  for (const v of ['AIzaSyRealLookingKey123', '919876543210', 'on', '']) assert.doesNotMatch(v, PLACEHOLDER);
  const env = { GIPHY_API_KEY: 'your-giphy-beta-key', GROQ_API_KEY: 'gsk_real', OWNER_NUMBER: '91XXXXXXXXXX' };
  assert.deepEqual(scrubPlaceholders(env).sort(), ['GIPHY_API_KEY', 'OWNER_NUMBER']);
  assert.deepEqual(env, { GROQ_API_KEY: 'gsk_real' });
});

test('Instagram /<username>/reel/<id>/ links are accepted and canonicalised', () => {
  const c = (u) => canonicalSocial(new URL(u), 'instagram');
  assert.equal(c('https://www.instagram.com/lyrics.aur.sukoon/reel/De1r37VpJvX/'), 'https://www.instagram.com/reel/De1r37VpJvX/');
  assert.equal(c('https://www.instagram.com/a.b/p/Cxyz123/?img_index=1'), 'https://www.instagram.com/p/Cxyz123/');
  assert.equal(c('https://www.instagram.com/reel/De1r37VpJvX/?igsh=abc'), 'https://www.instagram.com/reel/De1r37VpJvX/');
  assert.equal(c('https://www.instagram.com/lyrics.aur.sukoon/'), null);
  assert.equal(c('https://www.instagram.com/stories/someone/123/'), null);
});

test('an audio download in an mp4 container (YouTube DASH m4a) is sent as audio, not refused', async () => {
  assert.ok(AUDIO_CONTAINERS.has('video/mp4'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-sender-'));
  const f = path.join(dir, 'media.m4a');
  // minimal ISO-BMFF header with the "dash" major brand, which file-type reports as video/mp4
  const ftyp = Buffer.alloc(32); ftyp.writeUInt32BE(32, 0); ftyp.write('ftyp', 4); ftyp.write('dash', 8); ftyp.writeUInt32BE(0, 12); ftyp.write('iso6', 16); ftyp.write('mp41', 20); ftyp.write('dash', 24); ftyp.write('M4A ', 28);
  fs.writeFileSync(f, Buffer.concat([ftyp, Buffer.alloc(2048)]));
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'X' } }; } };
  try {
    await sendMediaFile(sock, 'a@s.whatsapp.net', { path: f, type: 'audio', mimetype: 'audio/mp4' }, null);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].mimetype, 'audio/mp4');
    assert.deepEqual(sent[0].audio, { url: f });
    // a claimed image that is really a video is still refused
    await assert.rejects(sendMediaFile(sock, 'a@s.whatsapp.net', { path: f, type: 'image' }, null), /does not match/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('download RAM gate follows the container limit, not the 909 MB Jarvis box', async () => {
  const { RAM_GATE_MB } = await import('../src/utils/downloader.js');
  assert.ok(RAM_GATE_MB >= 160 && RAM_GATE_MB <= 600);
});

test('temp sweep keeps the sticker font config and clears old scratch folders', async () => {
  const { default: config } = await import('../src/config/config.js');
  const { cleanupStaleJobs } = await import('../src/utils/fileManager.js');
  const t = config.paths.temp; fs.mkdirSync(t, { recursive: true });
  const old = new Date(Date.now() - 3 * 3600e3);
  const id = Date.now().toString(36);
  const conf = path.join(t, 'jarvis-fonts-test-' + id + '.conf'); fs.writeFileSync(conf, 'x'); fs.utimesSync(conf, old, old);
  const stale = path.join(t, 'stk-old' + id); fs.mkdirSync(stale); fs.writeFileSync(path.join(stale, 'a'), 'x'); fs.utimesSync(stale, old, old);
  const fresh = path.join(t, 'stk-new' + id); fs.mkdirSync(fresh);
  const other = path.join(t, 'keepme' + id); fs.mkdirSync(other); fs.utimesSync(other, old, old);
  try {
    await cleanupStaleJobs();
    assert.ok(fs.existsSync(conf), 'font config kept');
    assert.ok(!fs.existsSync(stale), 'old scratch folder removed');
    assert.ok(fs.existsSync(fresh), 'fresh scratch folder kept');
    assert.ok(fs.existsSync(other), 'unknown folder left alone');
  } finally { for (const p of [conf, stale, fresh, other]) fs.rmSync(p, { recursive: true, force: true }); }
});
