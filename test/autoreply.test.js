import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeAutoReply,setEnabled,setMessage,getState,_reset,addressedToOwner,DEFAULT_MESSAGE} from '../src/autoreply/index.js';
import ar from '../src/commands/autoreply.js';

const sock = () => { const sent = []; return { sent, user: { id: '919000000001:5@s.whatsapp.net', lid: '123456@lid' }, sendMessage: async (j, c) => { sent.push([j, c.text]); } }; };
const dm = (from = '911111111111@s.whatsapp.net', id = 'ABC123') => ({ key: { remoteJid: from, id, fromMe: false }, message: { conversation: 'hello' } });
const grp = (ctxInfo, id = 'G1') => ({ key: { remoteJid: '1203630@g.us', participant: '912222222222@s.whatsapp.net', id, fromMe: false }, message: { extendedTextMessage: { text: 'hey', contextInfo: ctxInfo } } });

test('default OFF, English default text', async () => {
  _reset(); process.env.X = '1';
  assert.equal(getState().enabled, false); assert.match(DEFAULT_MESSAGE, /busy right now/);
  const s = sock(); assert.equal(await maybeAutoReply(s, dm(), 'private', 'hello'), false); assert.equal(s.sent.length, 0);
});
test('ON: DM replies once per cooldown, custom message, never commands/bots/self', async () => {
  _reset(); setEnabled(true); const s = sock(); const t = Date.now();
  assert.equal(await maybeAutoReply(s, dm(), 'private', 'hello', t), true);
  assert.equal(await maybeAutoReply(s, dm('911111111111@s.whatsapp.net', 'X2'), 'private', 'again', t + 60000), false);
  assert.equal(await maybeAutoReply(s, dm('911111111111@s.whatsapp.net', 'X3'), 'private', 'later', t + 31 * 60000), true);
  assert.equal(await maybeAutoReply(s, dm('913333333333@s.whatsapp.net', 'X4'), 'private', '/ping', t), false);
  assert.equal(await maybeAutoReply(s, dm('914444444444@s.whatsapp.net', 'BAE5AAAA'), 'private', 'hi', t), false);
  assert.equal(await maybeAutoReply(s, dm('919000000001@s.whatsapp.net', 'X5'), 'private', 'me', t), false);
  setMessage('Busy, call later'); assert.equal(await maybeAutoReply(s, dm('915555555555@s.whatsapp.net', 'X6'), 'private', 'hi', t), true);
  assert.equal(s.sent.at(-1)[1], 'Busy, call later');
  _reset();
});
test('group: only mention or reply to owner', async () => {
  _reset(); setEnabled(true); const s = sock();
  assert.equal(await maybeAutoReply(s, grp({}), 'group', 'hey'), false);
  assert.equal(await maybeAutoReply(s, grp({ mentionedJid: ['919000000001@s.whatsapp.net'] }, 'G2'), 'group', 'hey'), true);
  _reset(); setEnabled(true);
  assert.equal(await maybeAutoReply(s, grp({ participant: '123456@lid' }, 'G3'), 'group', 'hey'), true);
  assert.equal(addressedToOwner({ kind: 'group', message: grp({ mentionedJid: ['999@lid'] }).message, ownerIds: ['919000000001'] }), false);
  setEnabled(false); _reset();
});
test('/autoreply command toggles and sets', async () => {
  _reset(); const out = []; const ctx = (args) => ({ args, reply: async (m) => out.push(m) });
  await ar.run(ctx(['on'])); assert.equal(getState().enabled, true);
  await ar.run(ctx(['set', 'Main busy hu'])); assert.equal(getState().text, 'Main busy hu');
  await ar.run(ctx(['reset'])); assert.equal(getState().text, DEFAULT_MESSAGE);
  await ar.run(ctx(['off'])); assert.equal(getState().enabled, false);
  assert.equal(ar.ownerOnly, true);
});

import {cleanSample, isRisky, tidyReply, styledPrompt} from '../src/autoreply/style.js';
import {setStyle, addSample, samples, clearSamples} from '../src/autoreply/index.js';
test('style helpers: samples, risk filter, safe reply', () => {
  assert.equal(cleanSample('see https://x.com'), null); assert.equal(cleanSample('ok bhai'), 'ok bhai');
  assert.equal(isRisky('bhai paise bhej do 5000'), true); assert.equal(isRisky('what is the otp'), true); assert.equal(isRisky('kya haal'), false);
  assert.equal(tidyReply('"busy hu, baad me bolta" ').endsWith('🤖'), true); assert.equal(tidyReply('call 9876543210'), null);
  assert.match(styledPrompt(['a', 'b', 'c'], 'hi'), /Never promise|never promise/i);
});
test('style reply: used when samples exist, falls back when AI is unavailable', async () => {
  _reset(); setEnabled(true); addSample('haan bhai'); addSample('kal baat karta hu'); addSample('busy hu yaar'); setStyle('style', true);
  assert.equal(samples().length, 3);
  const s = sock(); const t = Date.now();
  assert.equal(await maybeAutoReply(s, dm(), 'private', 'kya haal', t), true); // no AI key in tests: falls back to the plain message
  assert.equal(s.sent.at(-1)[1], DEFAULT_MESSAGE);
  setEnabled(false); setStyle('style', false); clearSamples(); _reset();
});
