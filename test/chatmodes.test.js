import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-'));
const cm = await import('../src/chatmodes/index.js');
const mk = () => { const sent = []; return { sent, sock: { user: { id: '9100000000:1@s.whatsapp.net', lid: '123@lid' }, sendMessage: async (j, c) => { sent.push(c.text); }, sendPresenceUpdate: async () => {} } }; };
const msg = (jid, extra = {}) => ({ key: { remoteJid: jid, id: 'A' + Math.random(), ...(jid.endsWith('@g.us') ? { participant: '5@s.whatsapp.net' } : {}) }, message: extra.message || {} });

test('no mode: nothing happens', async () => {
  cm._reset(); const { sock, sent } = mk();
  assert.equal(await cm.maybeChatMode(sock, msg('1@s.whatsapp.net'), 'private', 'hello'), false); assert.equal(sent.length, 0);
});
test('sticky chat answers DMs without a command, groups only when addressed', async () => {
  cm._reset(); const { sock, sent } = mk(); const ask = async () => ({ text: 'hi there' });
  cm.setChat('1@s.whatsapp.net', true); cm.setChat('2@g.us', true);
  assert.equal(await cm.maybeChatMode(sock, msg('1@s.whatsapp.net'), 'private', 'hello', { ask }), true);
  assert.equal(await cm.maybeChatMode(sock, msg('2@g.us'), 'group', 'random chatter', { ask }), false);
  assert.equal(await cm.maybeChatMode(sock, msg('2@g.us'), 'group', 'hey tab what is 2+2', { ask }), true);
  assert.equal(await cm.maybeChatMode(sock, msg('2@g.us'), 'group', 'tab main aaunga', { ask }), true, 'Jarvis-style first-word trigger');
  const mention = msg('2@g.us', { message: { extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: ['9100000000@s.whatsapp.net'] } } } });
  assert.equal(await cm.maybeChatMode(sock, mention, 'group', 'x question', { ask }), true);
  assert.equal(sent.length, 4);
  cm.setChat('1@s.whatsapp.net', false); assert.equal(await cm.maybeChatMode(sock, msg('1@s.whatsapp.net'), 'private', 'hi', { ask }), false);
});
test('auto-translate replies only for foreign text', async () => {
  cm._reset(); const { sock, sent } = mk(); cm.setTranslate('3@g.us', 'English');
  const translate = async (t) => ({ text: t === 'bonjour mon ami' ? 'hello my friend' : 'SAME' });
  await cm.maybeChatMode(sock, msg('3@g.us'), 'group', 'bonjour mon ami', { translate });
  await cm.maybeChatMode(sock, msg('3@g.us'), 'group', 'already english text', { translate });
  await cm.maybeChatMode(sock, msg('3@g.us'), 'group', '12345 :)', { translate });
  assert.equal(sent.length, 1); assert.match(sent[0], /hello my friend/);
});
test('rate limit and persistence', async () => {
  cm._reset(); cm.setTranslate('4@g.us', 'Hindi'); cm._reset();
  assert.equal(cm.getMode('4@g.us').tr, 'Hindi');
  const { sock, sent } = mk(); const translate = async () => ({ text: 'x y' });
  for (let i = 0; i < 20; i++) await cm.maybeChatMode(sock, msg('4@g.us'), 'group', 'hola amigos ' + i, { translate });
  assert.ok(sent.length <= 12);
});
