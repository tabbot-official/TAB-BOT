import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jgrp-'));
process.env.OWNER_NUMBER = '911111111111';
const storeMod = await import('../src/groups/store.js');
const { initStore, store } = storeMod;
const { cmds } = await import('../src/groups/commands.js');
const { moderate } = await import('../src/groups/moderation.js');
const { dropMeta } = await import('../src/groups/perms.js');
const { attachGroups } = await import('../src/groups/index.js');
await initStore();

const GID = '120363000000000001@g.us';
const people = [
  { id: '911111111111@s.whatsapp.net', admin: 'superadmin' }, // owner (group admin too)
  { id: '922222222222@s.whatsapp.net', admin: 'admin' },
  { id: '966666666666@s.whatsapp.net', admin: 'admin' },
  { id: '933333333333@s.whatsapp.net', admin: null },
  { id: '944444444444@s.whatsapp.net', admin: null },
  { id: '15550001111@s.whatsapp.net', admin: 'admin' }, // the bot
];
function fakeSock(botAdmin = true) {
  const sent = [];
  const ev = new Map();
  const sock = {
    user: { id: '15550001111:5@s.whatsapp.net' },
    sent,
    ev: { on: (n, f) => ev.set(n, f), emit: (n, d) => ev.get(n)?.(d) },
    groupMetadata: async () => ({ id: GID, subject: 'Test Group', desc: 'hello', participants: people.map((p) => (p.id.startsWith('1555') && !botAdmin ? { ...p, admin: null } : p)), creation: 1700000000, announce: false }),
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'M' + sent.length } }; },
    groupParticipantsUpdate: async (jid, ids, action) => { sent.push({ action, ids }); return [{ status: '200' }]; },
    groupInviteCode: async () => 'ABCDEF',
    groupSettingUpdate: async (jid, s) => { sent.push({ setting: s }); },
  };
  return sock;
}
function ctxFor(sock, from, text, extra = {}) {
  const parts = text.split(/\s+/);
  const msg = { key: { remoteJid: GID, participant: from, id: 'X' + Math.random() }, message: { extendedTextMessage: { text, contextInfo: extra.contextInfo } } };
  return { sock, msg, jid: GID, sender: from.split('@')[0], senderJid: from, text, args: parts.slice(1), isGroup: true, isOwner: from.startsWith('911111'), reply: (t) => sock.sendMessage(GID, { text: t }) };
}
const lastText = (s) => s.sent.filter((x) => x.content?.text).at(-1)?.content.text || '';

test('storage backend is chosen', () => { assert.ok(['better-sqlite3', 'node:sqlite', 'json'].includes(storeMod.backend)); });

test('member cannot warn, admin can, warnings are counted', async () => {
  const sock = fakeSock();
  const target = { mentionedJid: ['933333333333@s.whatsapp.net'] };
  await cmds.warn.run(ctxFor(sock, '944444444444@s.whatsapp.net', '/warn @933333333333 spam', { contextInfo: target }));
  assert.match(lastText(sock), /Only group admins/);
  await cmds.warn.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/warn @933333333333 spam', { contextInfo: target }));
  assert.match(lastText(sock), /1\/3/);
  assert.equal(store().listWarns(GID, '933333333333').length, 1);
  await cmds.resetwarn.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/resetwarn @933333333333', { contextInfo: target }));
  assert.equal(store().listWarns(GID, '933333333333').length, 0);
});

test('admins cannot be warned or removed by equal rank', async () => {
  const sock = fakeSock();
  const t = { mentionedJid: ['922222222222@s.whatsapp.net'] };
  await cmds.warn.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/warn @922222222222', { contextInfo: t }));
  assert.match(lastText(sock), /cannot be warned/);
  await cmds.remove.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/remove @922222222222', { contextInfo: t }));
  assert.match(lastText(sock), /same or higher rank/);
});

test('remove works on a member and needs bot admin', async () => {
  const sock = fakeSock();
  const t = { mentionedJid: ['933333333333@s.whatsapp.net'] };
  await cmds.remove.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/remove @933333333333', { contextInfo: t }));
  assert.ok(sock.sent.some((x) => x.action === 'remove'));
  const weak = fakeSock(false);
  await cmds.remove.run(ctxFor(weak, '922222222222@s.whatsapp.net', '/remove @933333333333', { contextInfo: t }));
  assert.match(lastText(weak), /Make me a group admin/);
});

test('moderation is off by default and works once enabled', async () => {
  dropMeta(GID);
  const sock = fakeSock();
  const mk = (text) => ({ key: { remoteJid: GID, participant: '933333333333@s.whatsapp.net', id: 'L' + Math.random() }, message: { conversation: text } });
  await moderate(sock, mk('visit https://spam.example.com now'), false);
  assert.equal(sock.sent.length, 0, 'nothing happens by default');
  await cmds.antilink.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/antilink on'));
  const before = sock.sent.length;
  await moderate(sock, mk('visit https://spam.example.com now'), false);
  assert.ok(sock.sent.length > before);
  assert.ok(sock.sent.some((x) => x.content?.delete), 'link deleted');
  // an admin posting a link is left alone
  const n = sock.sent.length;
  await moderate(sock, { key: { remoteJid: GID, participant: '922222222222@s.whatsapp.net', id: 'A1' }, message: { conversation: 'https://ok.example.com' } }, false);
  assert.equal(sock.sent.length, n);
});

test('welcome message only after /welcome on, and settings persist', async () => {
  const sock = fakeSock();
  attachGroups(sock);
  await new Promise((r) => setTimeout(r, 300));
  sock.ev.emit('group-participants.update', { id: GID, action: 'add', participants: [{ id: '955555555555@s.whatsapp.net' }] });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sock.sent.filter((x) => x.content?.text?.includes('Welcome')).length, 0);
  await cmds.welcome.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/welcome on'));
  sock.ev.emit('group-participants.update', { id: GID, action: 'add', participants: [{ id: '955555555555@s.whatsapp.net' }] });
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(sock.sent.some((x) => x.content?.text?.includes('Welcome @955555555555')));
});

test('group commands refuse private chats and info/rules work', async () => {
  const sock = fakeSock();
  const c = ctxFor(sock, '933333333333@s.whatsapp.net', '/groupinfo');
  await cmds.groupinfo.run(c);
  assert.match(lastText(sock), /Test Group/);
  await cmds.setrules.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/setrules 1. Be kind'));
  await cmds.rules.run(ctxFor(sock, '933333333333@s.whatsapp.net', '/rules'));
  assert.match(lastText(sock), /Be kind/);
  await cmds.groupinfo.run({ ...c, isGroup: false });
  assert.match(lastText(sock), /only works inside a group/);
});

test('schedule, groupconfig and botadmin', async () => {
  const sock = fakeSock();
  await cmds.schedule.run(ctxFor(sock, '922222222222@s.whatsapp.net', '/schedule 9:05 Good morning'));
  assert.match(lastText(sock), /09:05/);
  assert.equal(store().listSchedules(GID).length, 1);
  await cmds.groupconfig.run(ctxFor(sock, '911111111111@s.whatsapp.net', '/groupconfig warnlimit 5'));
  assert.match(lastText(sock), /set to: 5/);
  await cmds.groupconfig.run(ctxFor(sock, '911111111111@s.whatsapp.net', '/groupconfig warnlimit 99'));
  assert.match(lastText(sock), /whole number/);
  await cmds.botadmin.run(ctxFor(sock, '966666666666@s.whatsapp.net', '/botadmin add 933333333333'));
  assert.match(lastText(sock), /Only the bot owner/);
  await cmds.botadmin.run(ctxFor(sock, '911111111111@s.whatsapp.net', '/botadmin add 933333333333'));
  assert.deepEqual(store().botAdmins(), ['933333333333']);
});

test('runtime warning history preserves custom reason resembling an internal key',async()=>{dropMeta(GID);const sock=fakeSock();store().addWarn(GID,'933333333333','922222222222','moderation_link');await cmds.warnings.run(ctxFor(sock,'933333333333@s.whatsapp.net','/warnings'));assert.ok(lastText(sock).includes('moderation_link'));store().clearWarns(GID,'933333333333');});
test('runtime group rules preserve supplied braces and command text',async()=>{dropMeta(GID);const sock=fakeSock();const text='Please keep {user} and /example verbatim';const set=ctxFor(sock,'922222222222@s.whatsapp.net','/setrules '+text);set.jid='120363000000000099@g.us';await cmds.setrules.run(set);const get=ctxFor(sock,'933333333333@s.whatsapp.net','/rules');get.jid=set.jid;await cmds.rules.run(get);assert.ok(lastText(sock).includes(text));});
test('runtime automation reasons translate while manually authored keys stay literal',async()=>{const sock=fakeSock();const gid='120363000000000098@g.us';store().addWarn(gid,'933333333333','auto','moderation_links');store().addWarn(gid,'933333333333','922222222222','moderation_links');const ctx=ctxFor(sock,'933333333333@s.whatsapp.net','/warnings');ctx.jid=gid;await cmds.warnings.run(ctx);assert.ok(lastText(sock).includes('links are not allowed here'));assert.ok(lastText(sock).includes('moderation_links'));store().clearWarns(gid,'933333333333');});
