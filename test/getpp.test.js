import test from 'node:test';
import assert from 'node:assert/strict';
import cmd from '../src/commands/getpp.js';
const mk = (over = {}) => {
  const sent = [];
  const sock = { user: { id: '1@s.whatsapp.net' }, sendMessage: async (j, c) => { sent.push(c); }, onWhatsApp: async () => [{ exists: false }], profilePictureUrl: async () => { throw new Error('item-not-found'); }, ...over };
  return { sent, ctx: { msg: { message: {} }, args: [], sock, jid: 'c@s.whatsapp.net', isGroup: false, isOwner: false, senderJid: 's@s.whatsapp.net', ...over.ctx } };
};
test('number not on WhatsApp', async () => { const { sent, ctx } = mk(); ctx.args = ['919876543210']; await cmd.run(ctx); assert.match(sent[0].text, /not on WhatsApp/); });
test('no picture set', async () => { const { sent, ctx } = mk({ onWhatsApp: async () => [{ exists: true, jid: '91@s.whatsapp.net' }] }); ctx.args = ['919876543210']; await cmd.run(ctx); assert.match(sent[0].text, /no profile picture/); });
test('privacy hidden', async () => { const { sent, ctx } = mk({ onWhatsApp: async () => [{ exists: true }], profilePictureUrl: async () => { throw new Error('not-authorized'); } }); ctx.args = ['919876543210']; await cmd.run(ctx); assert.match(sent[0].text, /hides/); });
test('bad number and group-only', async () => { const a = mk(); a.ctx.args = ['12']; await cmd.run(a.ctx); assert.match(a.sent[0].text, /does not look/); const b = mk(); b.ctx.args = ['group']; await cmd.run(b.ctx); assert.match(b.sent[0].text, /inside a group/); });
