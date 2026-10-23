import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommands } from '../src/handlers/commandHandler.js';
import { handleMessage, trackOutgoing } from '../src/handlers/messageHandler.js';
import { ensureDirs } from '../src/utils/fileManager.js';
import { initDatabase } from '../src/database/database.js';

const sent = [];
const sock = {
  user: { id: '15550001111:1@s.whatsapp.net' },
  ev: { on() {} },
  sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: `BOT${sent.length}` } }; },
  readMessages: async () => {},
};
const mk = (text, extra = {}) => ({ key: { remoteJid: '919999999999@s.whatsapp.net', id: `ID${Math.random()}`, ...extra.key }, message: { conversation: text }, ...extra.rest });

test('command flow with a mocked socket', async () => {
  await ensureDirs(); await initDatabase(); await loadCommands(); trackOutgoing(sock);
  await handleMessage(sock, mk('/menu'));
  assert.match(sent.at(-1).content.text, /Tab Menu[\s\S]*Quick start[\s\S]*\/play <song>[\s\S]*START HERE[\s\S]*1\. General[\s\S]*Downloaders/);
  await handleMessage(sock, { ...mk('/play'), key: { remoteJid: '911111111111@s.whatsapp.net', id: 'x0' } });
  assert.match(sent.at(-1).content.text, /Missing input/);
  await handleMessage(sock, { ...mk('/ytaudio'), key: { remoteJid: '918888888888@s.whatsapp.net', id: 'x1' } });
  assert.match(sent.at(-1).content.text, /Missing input/); // hidden alias still resolves
  await handleMessage(sock, { ...mk('/video https://www.pinterest.com/pin/123456/'), key: { remoteJid: '917777777777@s.whatsapp.net', id: 'x2' } });
  assert.match(sent.at(-1).content.text, /not a youtube link/i); // /video is YouTube-only; other sites have their own commands
  await handleMessage(sock, { ...mk('/nope'), key: { remoteJid: '916666666666@s.whatsapp.net', id: 'x3' } });
  assert.match(sent.at(-1).content.text, /Unknown command/);
  const n = sent.length;
  await handleMessage(sock, { ...mk('/menu'), key: { remoteJid: 'a@s.whatsapp.net', id: 'BOT1', fromMe: true } }); // bot's own message id
  assert.equal(sent.length, n);
  await handleMessage(sock, { ...mk('/status'), key: { remoteJid: '915555555555@s.whatsapp.net', id: 'x4' } });
  assert.match(sent.at(-1).content.text, /ǫᴜᴇᴜᴇ/);
});

// Failure-reference path (previously covered via /video <pinterest link>, which /video now rejects as non-YouTube).
test('a failed command replies with a download-failed message and a reference id, without the raw error', async () => {
  const { replyFailure } = await import('../src/recovery/reply.js');
  const out = [];
  const ctx = { senderJid: '919999999999@s.whatsapp.net', sender: '919999999999', reply: async (text) => { out.push(text); } };
  await replyFailure(ctx, 'video', new Error('SECRET-INTERNAL-DETAIL spawn ENOENT /tmp/x'));
  assert.match(out.at(-1), /Reference: [a-f0-9]{10}/);
  assert.doesNotMatch(out.at(-1), /SECRET-INTERNAL-DETAIL|ENOENT/);
});
