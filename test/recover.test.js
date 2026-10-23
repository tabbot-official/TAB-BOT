import './_prefix.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'jrec-'));
process.env.OWNER_NUMBER = '911111111111';
const store = await import('../src/recover/store.js');
const rec = await import('../src/recover/index.js');
const { default: statusdl } = await import('../src/commands/statusdl.js');
const { default: antidelete } = await import('../src/commands/antidelete.js');
const { default: vv } = await import('../src/commands/vv.js');
const { default: vvn } = await import('../src/commands/vvn.js');
const { default: getpp } = await import('../src/commands/getpp.js');
const { default: deleted } = await import('../src/commands/deleted.js');

const SELF = '911111111111@s.whatsapp.net';
const mkSock = () => {
  const sent = [];
  return { sent, user: { id: '911111111111:5@s.whatsapp.net' }, sendMessage: async (jid, c) => { sent.push({ jid, c }); return { key: { id: 'x' } }; },
    groupMetadata: async () => ({ subject: 'Fam' }), profilePictureUrl: async (j) => { if (j.startsWith('999')) throw new Error('item-not-found'); return 'data:image/png;base64,iVBORw0KGgo='; } };
};
const txt = (id, jid, text, extra = {}) => ({ key: { id, remoteJid: jid, fromMe: false, ...extra }, pushName: 'Sam', message: { conversation: text } });
const revoke = (id, jid) => ({ key: { id: 'r' + id, remoteJid: jid, fromMe: false }, message: { protocolMessage: { type: 0, key: { id, remoteJid: jid } } } });
const ctxFor = (sock, over = {}) => ({ sock, jid: SELF, msg: { key: { id: 'c1', remoteJid: SELF, fromMe: true }, message: {} }, args: [], isOwner: true, isGroup: false, senderJid: SELF, ...over });

test('deleted private message is restored to the owner chat', async () => {
  const s = mkSock();
  await rec.observe(s, txt('A1', '922222222222@s.whatsapp.net', 'secret plan'));
  await rec.observe(s, revoke('A1', '922222222222@s.whatsapp.net'));
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].jid, SELF);
  assert.match(s.sent[0].c.text, /Deleted message[\s\S]*Sam[\s\S]*secret plan/);
  await rec.observe(s, revoke('A1', '922222222222@s.whatsapp.net'));
  assert.equal(s.sent.length, 1, 'no double restore');
});

test('group delete ignored when groups disabled; antidelete off ignores', async () => {
  const s = mkSock();
  store.setSetting('groups', false);
  const g = '120363000000000001@g.us';
  await rec.observe(s, txt('G1', g, 'hello', { participant: '933333333333@s.whatsapp.net' }));
  await rec.observe(s, revoke('G1', g));
  assert.equal(s.sent.length, 0);
  store.setSetting('groups', true);
  await rec.observe(s, txt('G2', g, 'hello2', { participant: '933333333333@s.whatsapp.net' }));
  await rec.observe(s, revoke('G2', g));
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].c.text, /group "Fam"/);
  store.setSetting('groups', false);
  store.setSetting('antidelete', false);
  await rec.observe(s, txt('P9', '922222222222@s.whatsapp.net', 'x'));
  await rec.observe(s, revoke('P9', '922222222222@s.whatsapp.net'));
  assert.equal(s.sent.length, 1);
  store.setSetting('antidelete', true);
});

test('own messages are not cached', async () => {
  const s = mkSock();
  await rec.observe(s, txt('O1', '922222222222@s.whatsapp.net', 'mine', { fromMe: true }));
  assert.equal(store.get('O1'), null);
});

test('status saved, listed, downloaded, and restored when deleted', async () => {
  const s = mkSock();
  store.add({ id: 'S1', kind: 'status', chat: 'status@broadcast', who: '944444444444', name: 'Ria', type: 'image', mime: 'image/jpeg', text: 'hi' }, Buffer.from('imgdata'));
  await statusdl.run(ctxFor(s));
  assert.match(s.sent.at(-1).c.text, /1\. Ria \+944444444444 - image/);
  await statusdl.run(ctxFor(s, { args: ['1'] }));
  assert.ok(s.sent.at(-1).c.image, 'status image sent');
  await statusdl.run(ctxFor(s, { args: ['ria'] }));
  assert.ok(s.sent.at(-1).c.image);
  await rec.observe(s, revoke('S1', 'status@broadcast'));
  assert.match(s.sent.at(-1).c.caption, /Deleted status/);
  await statusdl.run(ctxFor(s));
  assert.match(s.sent.at(-1).c.text, /No statuses saved/);
});

test('view-once photo and voice note recovery', async () => {
  const s = mkSock();
  store.add({ id: 'V1', kind: 'vo', chat: '922222222222@s.whatsapp.net', who: '922222222222', name: 'Sam', type: 'image', mime: 'image/jpeg', text: '' }, Buffer.from('p'));
  store.add({ id: 'V2', kind: 'vo', chat: '922222222222@s.whatsapp.net', who: '922222222222', name: 'Sam', type: 'audio', mime: 'audio/ogg; codecs=opus', ptt: true }, Buffer.from('a'));
  await vv.run(ctxFor(s));
  assert.ok(s.sent.at(-1).c.image);
  await vvn.run(ctxFor(s));
  assert.ok(s.sent.some((x) => x.c.audio && x.c.ptt));
  const reply = ctxFor(s, { msg: { key: { id: 'c2', remoteJid: SELF, fromMe: true }, message: { extendedTextMessage: { text: '/vv', contextInfo: { stanzaId: 'V2' } } } } });
  await vv.run(reply);
  assert.match(s.sent.at(-1).c.text, /Use \/vvn/);
});

test('command typed in another chat is deleted and answer goes to self chat', async () => {
  const s = mkSock();
  const other = '922222222222@s.whatsapp.net';
  await vv.run(ctxFor(s, { jid: other, msg: { key: { id: 'c3', remoteJid: other, fromMe: true }, message: {} } }));
  assert.ok(s.sent.some((x) => x.c.delete));
  assert.equal(s.sent.at(-1).jid, SELF);
});

test('view-once detection through wrappers', () => {
  const { m, viewOnce } = rec.unwrap({ viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } });
  assert.ok(viewOnce && m.imageMessage);
  assert.equal(rec.unwrap({ imageMessage: { viewOnce: true } }).viewOnce, true);
  assert.equal(rec.unwrap({ conversation: 'x' }).viewOnce, false);
});

test('getpp works, hides gracefully', async (t) => {
  // Real fetchPublic/requestPublic guard runs; only DNS and the https transport are replaced.
  const dns = (await import('node:dns/promises')).default; const https = (await import('node:https')).default;
  const { EventEmitter } = await import('node:events'); const { Readable } = await import('node:stream');
  const jpeg = Buffer.alloc(240); jpeg[0] = 0xff; jpeg[1] = 0xd8;
  const reqs = [];
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'request', (u, opts, cb) => {
    const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
    req.end = () => { const res = Readable.from([jpeg]); res.statusCode = 200; res.headers = {}; reqs.push({ host: new URL(u).hostname, pinned: opts.lookup }); cb(res); };
    return req;
  });
  const s = mkSock();
  s.profilePictureUrl = async (j) => { if (j.startsWith('999')) throw new Error('item-not-found'); return 'https://pps.whatsapp.net/v/t61/pp.jpg'; };
  await getpp.run(ctxFor(s, { args: ['919876543210'] }));
  assert.ok(s.sent.at(-1).c.image);
  assert.equal(reqs.length, 1); assert.equal(reqs[0].host, 'pps.whatsapp.net');
  await new Promise((ok) => reqs[0].pinned('pps.whatsapp.net', {}, (e, addr) => { assert.equal(addr, '93.184.216.34'); ok(); })); // connection pinned to the validated address
  await getpp.run(ctxFor(s, { args: ['999876543210'] }));
  assert.match(s.sent.at(-1).c.text, /no profile picture/i);
  const other = ctxFor(s, { jid: '955@s.whatsapp.net', isOwner: false, msg: { key: { id: 'z', remoteJid: '955@s.whatsapp.net', fromMe: false }, message: {} } });
  await getpp.run(other);
  assert.equal(s.sent.at(-1).jid, '955@s.whatsapp.net');
  // a profile URL that resolves to a private address is refused by the real guard (no request made)
  const before = reqs.length; dns.lookup.mock.mockImplementation(async () => [{ address: '10.0.0.5', family: 4 }]);
  await getpp.run(ctxFor(s, { args: ['919876543210'] }));
  assert.equal(reqs.length, before); assert.ok(!s.sent.at(-1).c.image);
});

test('antidelete settings, /deleted list, size cap and expiry', async () => {
  const s = mkSock();
  await antidelete.run(ctxFor(s, { args: ['groups', 'on'] }));
  assert.equal(store.getSettings().groups, true);
  await antidelete.run(ctxFor(s, { args: ['off'] }));
  assert.equal(store.getSettings().antidelete, false);
  assert.match(s.sent.at(-1).c.text, /Deleted chat messages: OFF/);
  await antidelete.run(ctxFor(s, { args: ['on'] }));
  await deleted.run(ctxFor(s));
  assert.match(s.sent.at(-1).c.text, /Recently deleted/);
  store.add({ id: 'OLD', kind: 'msg', chat: 'x', who: '1', type: 'text', text: 'old', ts: Date.now() - 49 * 3600_000 });
  store.prune();
  assert.equal(store.get('OLD'), null);
  const big = Buffer.alloc(19 * 1024 * 1024);
  for (let i = 0; i < 6; i++) store.add({ id: 'B' + i, kind: 'msg', chat: 'x', who: '1', type: 'document' }, big);
  assert.ok(store.totalBytes() <= store.LIMITS.maxTotal, 'cap holds');
  assert.equal(store.add({ id: 'HUGE', kind: 'msg', chat: 'x', who: '1', type: 'document' }, Buffer.alloc(21 * 1024 * 1024)).file, undefined);
});

test('setprefix accepts symbols, digits, letters, emoji; persists; escape hatch', async () => {
  const config = (await import('../src/config/config.js')).default;
  const { default: setprefix } = await import('../src/commands/setprefix.js');
  const { parseCommand } = await import('../src/handlers/commandHandler.js');
  const replies = [];
  const c = (args) => ({ args, reply: async (t) => replies.push(t) });
  for (const p of ['!', '.', '#', '7', 'x', '🤖', '👨‍👩‍👧', '$$']) {
    await setprefix.run(c([p]));
    assert.equal(config.prefix, p);
    assert.deepEqual(parseCommand(`${p}menu`), { name: 'menu', args: [] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(config.paths.data, 'prefix.json'), 'utf8')).prefix, p);
  }
  assert.equal(parseCommand('/menu'), null, 'old prefix no longer works');
  await setprefix.run(c(['two words']));
  assert.match(replies.at(-1), /spaces/);
  await setprefix.run(c(['abcd']));
  assert.match(replies.at(-1), /short/);
  assert.equal(config.prefix, '$$');
  assert.deepEqual(parseCommand('/setprefix reset'), { name: 'setprefix', args: ['reset'] }, 'escape hatch');
  await setprefix.run(c(['reset']));
  assert.equal(config.prefix, '/');
});

test('recover switches persist across init', () => {
 // antiedit joined the recover switches after this test was written; cover all five, and an off value too.
 for(const key of ['antidelete','groups','status','vo'])store.setSetting(key,true);
 store.setSetting('antiedit',false);
 store.init();
 assert.deepEqual(store.getSettings(),{antidelete:true,groups:true,status:true,vo:true,antiedit:false});
 store.setSetting('antiedit',true);
 store.init();
 assert.equal(store.getSettings().antiedit,true);
});

test('prefix write failure preserves both active and stored prefix',async()=>{const config=(await import('../src/config/config.js')).default;const {default:cmd}=await import('../src/commands/setprefix.js');const file=path.join(config.paths.data,'prefix.json');const old=config.prefix,bytes=fs.readFileSync(file);fs.mkdirSync(file+'.tmp');try{await assert.rejects(cmd.run({args:['#'],reply:async()=>{throw new Error('must not claim success');}}),/store unavailable/);assert.equal(config.prefix,old);assert.deepEqual(fs.readFileSync(file),bytes);}finally{fs.rmdirSync(file+'.tmp');}});
