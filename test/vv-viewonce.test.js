// .vv / .vvn: recover a view-once by replying to it, for every Baileys v7 message shape.
import './_prefix.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jvv-'));
process.env.OWNER_NUMBER = '911111111111';
const { recoverViewOnce, quotedMedia, replyInfo } = await import('../src/commands/_vo.js');
const vv = (await import('../src/commands/vv.js')).default;
const vvn = (await import('../src/commands/vvn.js')).default;

const img = { mimetype: 'image/jpeg', caption: 'secret', mediaKey: 'k', directPath: '/p', viewOnce: true };
const vid = { mimetype: 'video/mp4', caption: '', mediaKey: 'k', directPath: '/p', viewOnce: true };
const ptt = { mimetype: 'audio/ogg; codecs=opus', ptt: true, mediaKey: 'k', directPath: '/p', viewOnce: true };
const SHAPES = {
  viewOnceMessage: { viewOnceMessage: { message: { imageMessage: img } } },
  viewOnceMessageV2: { viewOnceMessageV2: { message: { videoMessage: vid } } },
  viewOnceMessageV2Extension: { viewOnceMessageV2Extension: { message: { audioMessage: ptt } } },
  'bare viewOnce:true flag': { imageMessage: img },
  'ephemeral + viewOnceMessageV2': { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: img } } } } },
};

function ctx(quoted, { wrapCommand = false } = {}) {
  const sent = [];
  const ext = { text: '.vv', contextInfo: { stanzaId: 'Q' + Math.random(), participant: '933333333333@s.whatsapp.net', quotedMessage: quoted } };
  const message = wrapCommand ? { ephemeralMessage: { message: { extendedTextMessage: ext } } } : { extendedTextMessage: ext };
  return {
    sent, jid: '933333333333@s.whatsapp.net', isOwner: true,
    msg: { key: { remoteJid: '933333333333@s.whatsapp.net', id: 'CMD', fromMe: false }, message },
    sock: { user: { id: '911111111111:1@s.whatsapp.net' }, sendMessage: async (jid, c) => { sent.push({ jid, c }); return {}; } },
  };
}
const calls = [];
const download = async (msg) => { calls.push(msg); return Buffer.from('MEDIA:' + Object.keys(msg.message)[0]); };

test('quotedMedia finds the media in every view-once shape', () => {
  assert.equal(quotedMedia(SHAPES.viewOnceMessage).type, 'image');
  assert.equal(quotedMedia(SHAPES.viewOnceMessageV2).type, 'video');
  assert.equal(quotedMedia(SHAPES.viewOnceMessageV2Extension).type, 'audio');
  for (const s of Object.values(SHAPES)) assert.equal(quotedMedia(s).viewOnce, true);
  assert.equal(quotedMedia({ conversation: 'hi' }), null);
});

for (const [name, shape] of Object.entries(SHAPES)) {
  test(`reply recovery works for ${name}`, async () => {
    const q = quotedMedia(shape);
    const types = q.type === 'audio' ? ['audio'] : ['image', 'video'];
    const c = ctx(shape, { wrapCommand: name.startsWith('ephemeral') });
    calls.length = 0;
    await recoverViewOnce(c, types, 'view-once', { download });
    assert.equal(calls.length, 1, 'downloaded once');
    assert.deepEqual(Object.keys(calls[0].message), [q.field]);
    assert.equal(calls[0].key.id, replyInfo(c.msg.message).stanzaId);
    const out = c.sent[0].c;
    assert.ok(Buffer.isBuffer(out[q.type]), 'resent as ' + q.type);
    assert.match(String(out[q.type]), /^MEDIA:/);
    if (q.type === 'audio') { assert.equal(out.ptt, true); assert.match(c.sent[1].c.text, /View-once from/); }
    else assert.match(out.caption, /View-once from[\s\S]*/);
  });
}

test('.vv on a voice note points to .vvn, and .vvn on a photo points to .vv', async () => {
  let c = ctx(SHAPES.viewOnceMessageV2Extension);
  await recoverViewOnce(c, ['image', 'video'], 'x', { download });
  assert.match(c.sent[0].c.text, /voice note.*[./]vvn/);
  c = ctx(SHAPES.viewOnceMessage);
  await recoverViewOnce(c, ['audio'], 'x', { download });
  assert.match(c.sent[0].c.text, /photo.*[./]vv\b/);
});

test('a failed download says so instead of sending nothing', async () => {
  const c = ctx(SHAPES.viewOnceMessage);
  await recoverViewOnce(c, ['image', 'video'], 'view-once photo or video', { download: async () => { throw new Error('410'); } });
  assert.match(c.sent[0].c.text, /Could not download/);
});

test('owner typing .vv in someone else\'s chat: the command is deleted there and the media goes to the owner\'s own chat', async () => {
  const c = ctx(SHAPES.viewOnceMessage); c.msg.key.fromMe = true;
  await recoverViewOnce(c, ['image', 'video'], 'x', { download });
  assert.ok(c.sent[0].c.delete, 'command deleted in the other chat');
  assert.equal(c.sent[1].jid, '911111111111@s.whatsapp.net');
  assert.ok(c.sent[1].c.image);
});

test('.vv and .vvn keep the Jarvis owner-only gating', () => {
  assert.equal(vv.ownerOnly, true); assert.equal(vvn.ownerOnly, true);
});
