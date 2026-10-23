import test from 'node:test';
import assert from 'node:assert/strict';
import { introText, botWasAdded } from '../src/groups/onboard.js';
const num = (j) => String(j).split('@')[0].split(':')[0];
test('intro uses prefix and name', () => {
  const t = introText('.', 'Jarvis');
  assert.match(t, /\*\.menu\*/); assert.match(t, /Jarvis/); assert.match(t, /stay off until an admin/);
});
test('detects the bot among added members', () => {
  assert.equal(botWasAdded(['111@s.whatsapp.net', '999:5@s.whatsapp.net'], ['999'], num), true);
  assert.equal(botWasAdded(['111@s.whatsapp.net'], ['999'], num), false);
  assert.equal(botWasAdded([], ['999'], num), false);
});
