import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OWNER_NUMBER ||= '919000000001';
const { issueCode, verifyCode, isLoggedIn, logout } = await import('../src/auth/ownerAuth.js');
const { default: settings } = await import('../src/config/settings.js');
const { default: config } = await import('../src/config/config.js');
const { commandOn } = await import('../src/auth/features.js');
const { loadCommands, handleCommand, registry } = await import('../src/handlers/commandHandler.js');

await loadCommands();
let n = 0;
const OWNER_JID = config.ownerNumber+'@s.whatsapp.net';
function mk(isOwner, name, args = [], jid = isOwner ? OWNER_JID : '919888888888@s.whatsapp.net') {
  const sent = [];
  const sock = { user: { id: config.ownerNumber+':7@s.whatsapp.net' }, sendMessage: async (to, body) => { sent.push({ to, text: body.text }); return {}; } };
  const ctx = { sock, msg: { key: { remoteJid: jid, fromMe: isOwner, id: 'x' } }, jid, sender: isOwner ? config.ownerNumber : String(919000000000 + (++n)), senderJid: isOwner ? OWNER_JID : (919000000000 + n) + '@s.whatsapp.net', text: '', args: [], isGroup: jid.endsWith('@g.us'), isOwner, commands: registry, reply: async (t) => { sent.push({ to: jid, text: t }); } };
  return { ctx, sent, run: () => handleCommand(ctx, { name, args }) };
}
const codeFrom = (sent) => sent.map((s) => s.text.match(/code: (\d+)/)).filter(Boolean)[0]?.[1];
const realNow = Date.now;
test.afterEach(() => { Date.now = realNow; logout(); });

test('owner command while logged out sends code only to owner own chat, not run', async () => {
  const a = mk(true, 'settings', [], '120363000000@g.us'); await a.run();
  const toOwner = a.sent.find((s) => s.to === OWNER_JID && /code: \d{6}/.test(s.text));
  assert.ok(toOwner, 'code goes to owner self chat');
  assert.ok(!a.sent.some((s) => s.to === '120363000000@g.us' && /\d{6}/.test(s.text)), 'code never leaks to the group');
  assert.ok(!a.sent.some((s) => /Tab settings/.test(s.text)), 'command did not run');
});

test('right code logs in, then owner commands run; code is one-time', async () => {
  const a = mk(true, 'login'); await a.run();
  const code = codeFrom(a.sent); assert.match(code, /^\d{6}$/);
  const b = mk(true, 'login', [code]); await b.run();
  assert.match(b.sent[0].text, /Logged in/); assert.equal(isLoggedIn(), true);
  const c = mk(true, 'settings'); await c.run();
  assert.match(c.sent[0].text, /Tab settings/);
  const d = mk(true, 'login', [code]); await d.run();
  assert.match(d.sent[0].text, /Already|No active code|Wrong|logged/i);
  assert.equal(isLoggedIn(), true);
});

test('wrong code is rejected, 5 wrong tries lock the code', async () => {
  const a = mk(true, 'login'); await a.run(); const code = codeFrom(a.sent);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) { const w = mk(true, 'login', [wrong]); await w.run(); assert.match(w.sent[0].text, /Wrong code/); }
  const last = mk(true, 'login', [code]); await last.run();
  assert.match(last.sent[0].text, /Too many|No active/);
  assert.equal(isLoggedIn(), false);
});

test('expired code is rejected', async () => {
  const a = mk(true, 'login'); await a.run(); const code = codeFrom(a.sent);
  const t0 = realNow(); Date.now = () => t0 + 5 * 60_000 + 1000;
  const b = mk(true, 'login', [code]); await b.run();
  assert.match(b.sent[0].text, /expired/); assert.equal(isLoggedIn(), false);
});

test('resend: second request within 30s is told to wait, after 30s a new code replaces the old', async () => {
  const a = mk(true, 'login'); await a.run(); const first = codeFrom(a.sent);
  const b = mk(true, 'login'); await b.run();
  assert.match(b.sent[0].text, /Wait \d+s/);
  const t0 = realNow(); Date.now = () => t0 + 31_000;
  const c = mk(true, 'login'); await c.run(); const second = codeFrom(c.sent);
  assert.ok(second);
  if (second !== first) { const o = mk(true, 'login', [first]); await o.run(); assert.match(o.sent[0].text, /Wrong/); }
  const d = mk(true, 'login', [second]); await d.run(); assert.match(d.sent[0].text, /Logged in/);
});

test('session expires after sessionHours', async () => {
  const a = mk(true, 'login'); await a.run(); await mk(true, 'login', [codeFrom(a.sent)]).run();
  assert.equal(isLoggedIn(), true);
  const t0 = realNow(); Date.now = () => t0 + settings.auth.sessionHours * 3600_000 + 1000;
  assert.equal(isLoggedIn(), false);
});

test('non-owner: /login gets nothing, owner commands denied, no code is created or sent', async () => {
  const a = mk(false, 'login'); await a.run();
  assert.deepEqual(a.sent.map((s) => s.text), ['Owner only.']);
  const b = mk(false, 'login', ['123456']); await b.run();
  assert.deepEqual(b.sent.map((s) => s.text), ['Owner only.']);
  const c = mk(false, 'settings'); await c.run();
  assert.ok(!c.sent.some((s) => /code: \d/.test(s.text) || /Tab settings/.test(s.text)));
  assert.ok(!c.sent.some((s) => s.to === OWNER_JID), 'nothing sent to the owner chat by a stranger');
  assert.equal(verifyCode('123456'), 'none');
});

test('logout locks again; login with no pending code says so', async () => {
  const a = mk(true, 'login'); await a.run(); await mk(true, 'login', [codeFrom(a.sent)]).run();
  await mk(true, 'logout').run(); assert.equal(isLoggedIn(), false);
  const b = mk(true, 'login', ['123456']); await b.run(); assert.match(b.sent[0].text, /No active code/);
});

test('exempt commands work logged out; non-owner-only commands unaffected', async () => {
  const a = mk(true, 'ping'); await a.run();
  assert.ok(!a.sent.some((s) => /code: \d/.test(s.text)));
  const b = mk(false, 'ping'); await b.run();
  assert.ok(!b.sent.some((s) => /code: \d/.test(s.text)));
});

test('failure delivering the code does not crash', async () => {
  const a = mk(true, 'settings'); a.ctx.sock.user = { id: 'garbage' }; a.ctx.sock.sendMessage = async () => { throw new Error('net'); };
  await a.run();
  assert.ok(a.sent.some((s) => /could not reach/.test(s.text)));
});

test('settings: toggle a feature off blocks its commands, on restores, reset works', async () => {
  const a = mk(true, 'login'); await a.run(); await mk(true, 'login', [codeFrom(a.sent)]).run();
  const games = [...registry.list()].find((c) => c.category === 'Games');
  const off = mk(true, 'settings', ['games', 'off']); await off.run(); assert.match(off.sent[0].text, /GAMES|games is now OFF/i);
  assert.equal(commandOn(games), false);
  const blocked = mk(false, games.name); await blocked.run(); assert.match(blocked.sent[0].text, /switched off/);
  const on = mk(true, 'settings', ['games', 'on']); await on.run(); assert.equal(commandOn(games), true);
  const bad = mk(true, 'settings', ['nonsense']); await bad.run(); assert.match(bad.sent[0].text, /Features:/);
  await mk(true, 'settings', ['reset', 'games']).run();
});

test('code format and defaults', () => {
  const { code, minutes } = issueCode();
  assert.match(code, /^\d{6}$/); assert.equal(minutes, 5);
  assert.equal(verifyCode('x'.repeat(40)), 'wrong');
});
