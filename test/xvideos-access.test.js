// .xvideos access rules: anyone in private chat; groups off until an admin (or the owner) sends ".xvideos on".
process.env.PREFIX = '.';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jxv-'));
process.env.OWNER_NUMBER = '911111111111';
const { initStore, settings } = await import('../src/groups/store.js');
const { setDisabled } = await import('../src/downloaders/platforms.js');
const { permitted } = await import('../src/permissions/index.js');
const xv = (await import('../src/commands/xvideos.js')).default;
await initStore();

const GID = '120363000000000077@g.us';
const people = [
  { id: '922222222222@s.whatsapp.net', admin: 'admin' },
  { id: '933333333333@s.whatsapp.net', admin: null },
];
function ctx({ jid, sender, isOwner = false, args = [] }) {
  const out = [];
  const isGroup = jid.endsWith('@g.us');
  return {
    out, jid, isGroup, isOwner, args, sender, senderJid: sender + '@s.whatsapp.net',
    sock: { groupMetadata: async () => ({ id: GID, participants: people }), sendMessage: async () => ({}) },
    reply: async (t) => { out.push(String(t)); return {}; },
  };
}
const run = async (o) => { const c = ctx(o); await xv.run(c); return c.out.join('\n'); };

test('.xvideos is no longer owner-only, so the dispatcher lets anyone through', async () => {
  assert.equal(xv.ownerOnly, undefined);
  assert.equal(await permitted(ctx({ jid: '955555555555@s.whatsapp.net', sender: '955555555555' }), xv), true);
});

test('private chat: a non-owner gets past every gate', async () => {
  const r = await run({ jid: '955555555555@s.whatsapp.net', sender: '955555555555' });
  assert.match(r, /Usage:/);
  const r2 = await run({ jid: '955555555555@s.whatsapp.net', sender: '955555555555', args: ['3'] });
  assert.match(r2, /No result #3/);
});

test('group: off by default, a member is told an admin can enable it', async () => {
  assert.equal(settings(GID).xvideos, false);
  const r = await run({ jid: GID, sender: '933333333333', args: ['test'] });
  assert.match(r, /off in this group.*\.xvideos on/);
});

test('group: a non-admin cannot turn it on', async () => {
  const r = await run({ jid: GID, sender: '933333333333', args: ['on'] });
  assert.match(r, /Only a group admin/);
  assert.equal(settings(GID).xvideos, false);
});

test('group: admin turns it on, then a member can use it; admin turns it off again', async () => {
  assert.match(await run({ jid: GID, sender: '922222222222', args: ['on'] }), /now ON/);
  assert.equal(settings(GID).xvideos, true);
  assert.match(await run({ jid: GID, sender: '933333333333' }), /Usage:/);
  assert.match(await run({ jid: GID, sender: '933333333333', args: ['2'] }), /No result #2/);
  assert.match(await run({ jid: GID, sender: '922222222222', args: ['OFF'] }), /now OFF/);
  assert.match(await run({ jid: GID, sender: '933333333333', args: ['x'] }), /off in this group/);
});

test('group: the bot owner can toggle it even without being a group admin', async () => {
  assert.match(await run({ jid: GID, sender: '911111111111', isOwner: true, args: ['on'] }), /now ON/);
  assert.match(await run({ jid: GID, sender: '911111111111', isOwner: true, args: ['off'] }), /now OFF/);
});

test('".xvideos on" in a private chat explains it is for groups', async () => {
  assert.match(await run({ jid: '955555555555@s.whatsapp.net', sender: '955555555555', args: ['on'] }), /for groups/);
});

test('.platformdisable xvideos still switches it off everywhere', async () => {
  const file = path.resolve('data', 'platform-disabled.json');
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  setDisabled('xvideos', true);
  try {
    assert.match(await run({ jid: '955555555555@s.whatsapp.net', sender: '955555555555', args: ['x'] }), /switched off by the bot owner/);
    await run({ jid: GID, sender: '922222222222', args: ['on'] });
    assert.match(await run({ jid: GID, sender: '933333333333', args: ['x'] }), /switched off by the bot owner/);
  } finally {
    setDisabled('xvideos', false);
    if (before) fs.writeFileSync(file, before); else fs.rmSync(file, { force: true });
  }
});
