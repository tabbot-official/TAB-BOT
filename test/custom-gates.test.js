import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.OWNER_NUMBER ||= '919000000001';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
const { default: config } = await import('../src/config/config.js');
const { default: settings } = await import('../src/config/settings.js');
const C = await import('../src/custom/index.js');
const { loadCommands, handleCommand } = await import('../src/handlers/commandHandler.js');
await loadCommands();
const JID = '120363000111@g.us';
function mk(sender) {
  const sent = [];
  const sock = { user: { id: config.ownerNumber + ':7@s.whatsapp.net' }, sendMessage: async (to, b) => { sent.push(b.text); return {}; } };
  const ctx = { sock, msg: { key: { remoteJid: JID, id: 'x' }, pushName: 'Ravi' }, jid: JID, sender, senderJid: sender + '@s.whatsapp.net', args: [], isGroup: true, isOwner: false, commands: new Map(), reply: async (t) => sent.push(t) };
  return { ctx, sent };
}
test.beforeEach(() => { C._reset(); C.add(JID, 'zzcustom', 'hello {user}'); });
test('custom command replies for a normal user', async () => {
  const a = mk('919700000001'); await handleCommand(a.ctx, { name: 'zzcustom', args: [] });
  assert.deepEqual(a.sent, ['hello Ravi']);
});
test('owner-only mode blocks custom commands for non-owners', async () => {
  const keep = config.ownerOnly; config.ownerOnly = true;
  try { const a = mk('919700000002'); await handleCommand(a.ctx, { name: 'zzcustom', args: [] }); assert.deepEqual(a.sent, []); } finally { config.ownerOnly = keep; }
});
test('owner can switch all custom commands off', async () => {
  const keep = settings.disabledCommands; settings.disabledCommands = [...(keep || []), 'custom'];
  try { const a = mk('919700000003'); await handleCommand(a.ctx, { name: 'zzcustom', args: [] }); assert.equal(a.sent.length, 1); assert.match(a.sent[0], /switched off/); } finally { settings.disabledCommands = keep; }
});
test('cooldown applies to custom commands', async () => {
  const keep = config.limits.cooldownMs; config.limits.cooldownMs = 60000;
  try { const a = mk('919700000004'); await handleCommand(a.ctx, { name: 'zzcustom', args: [] }); await handleCommand(a.ctx, { name: 'zzcustom', args: [] }); assert.equal(a.sent[0], 'hello Ravi'); assert.equal(a.sent.length, 2); assert.notEqual(a.sent[1], 'hello Ravi'); } finally { config.limits.cooldownMs = keep; }
});
