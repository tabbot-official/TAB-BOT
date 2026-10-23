import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-auth-refresh-'));
process.env.OWNER_NUMBER = '911111111111';
const { initStore, settings } = await import('../src/groups/store.js');
const { cmds } = await import('../src/groups/commands.js');
const { getMeta, dropMeta } = await import('../src/groups/perms.js');
await initStore();
const admin = '922222222222@s.whatsapp.net';
const bot = '15550001111@s.whatsapp.net';
const meta = (gid, role = 'admin') => ({ id: gid, subject: 'Test', participants: [{ id: admin, admin: role }, { id: bot, admin: 'admin' }] });
function context(sock, jid, sender = admin) {
  const replies = [], actions = [];
  sock.sendMessage = async (_, content) => { replies.push(content.text); };
  sock.groupParticipantsUpdate = async (...args) => { actions.push(args); };
  return { sock, jid, sender: sender.split('@')[0], senderJid: sender, isGroup: true, isOwner: false, text: '/setrules changed', args: ['changed'], msg: {key: {remoteJid: jid, participant: sender, id: 'test'}}, reply: async text => replies.push(text), replies, actions };
}

test('privileged setting change checks current roles, not cached display metadata', async () => {
  const gid = 'auth-revoked@g.us', sock = { user: { id: bot }, groupMetadata: async () => meta(gid) };
  await getMeta(sock, gid);
  sock.groupMetadata = async () => meta(gid, null);
  const ctx = context(sock, gid);
  await cmds.setrules.run(ctx);
  assert.match(ctx.replies.at(-1), /Only group admins/);
  assert.notEqual(settings(gid).rules, 'changed');
  assert.equal(ctx.actions.length, 0); dropMeta(gid);
});

test('failed privileged metadata refresh preserves settings and performs no action', async () => {
  const gid = 'auth-failure@g.us', sock = { user: { id: bot }, groupMetadata: async () => meta(gid) };
  await getMeta(sock, gid);
  sock.groupMetadata = async () => { throw Error('offline'); };
  const ctx = context(sock, gid), before = settings(gid).rules;
  await cmds.setrules.run(ctx);
  assert.equal(settings(gid).rules, before); assert.equal(ctx.actions.length, 0);
  assert.ok(ctx.replies.at(-1)); dropMeta(gid);
});

test('legitimate admin still changes settings after fresh successful role check', async () => {
  const gid = 'auth-legitimate@g.us'; let calls = 0;
  const sock = {user: {id: bot}, groupMetadata: async () => {calls++; return meta(gid);} };
  await getMeta(sock, gid);
  const ctx = context(sock, gid); await cmds.setrules.run(ctx);
  assert.equal(settings(gid).rules, 'changed'); assert.equal(calls, 2); dropMeta(gid);
});

test('metadata invalidated during refresh cannot authorize privileged change', async () => {
  const gid = 'auth-race@g.us'; let resolve;
  const sock = {user: {id: bot}, groupMetadata: () => new Promise(r => {resolve = r;})};
  const ctx = context(sock, gid), pending = cmds.setrules.run(ctx);
  await new Promise(r => setImmediate(r)); dropMeta(gid); resolve(meta(gid)); await pending;
  assert.notEqual(settings(gid).rules, 'changed'); assert.equal(ctx.actions.length,0);
});

test('owner remains owner and a legitimate admin cannot use owner-only botadmin', async () => {
  const gid = 'auth-owner@g.us', sock = {user: {id: bot}, groupMetadata: async () => meta(gid, null)};
  const owner = context(sock, gid, '911111111111@s.whatsapp.net'); owner.isOwner = true;
  await cmds.setrules.run(owner); assert.equal(settings(gid).rules, 'changed');
  const otherGid = 'auth-owner-deny@g.us', otherSock = {user: {id: bot}, groupMetadata: async () => meta(otherGid)};
  const member = context(otherSock,otherGid); member.args=['add','933333333333'];
  await cmds.botadmin.run(member); assert.match(member.replies.at(-1),/Only the bot owner/);
});

test('fresh metadata also catches loss of bot-admin status before a group action', async () => {
  const gid = 'auth-bot-revoked@g.us', sock = {user: {id: bot}, groupMetadata: async () => meta(gid)};
  await getMeta(sock,gid);
  sock.groupMetadata = async () => ({...meta(gid),participants:[{id:admin,admin:'admin'},{id:bot,admin:null}]});
  const ctx = context(sock,gid); await cmds.revoke.run(ctx);
  assert.match(ctx.replies.at(-1),/Make me a group admin/); assert.equal(ctx.actions.length,0);
});
