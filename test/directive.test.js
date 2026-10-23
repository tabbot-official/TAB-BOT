import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
process.env.OWNER_NUMBER ||= '919000000001';
process.env.MAINTAINER_DIRECTIVES = 'on'; // Original Jarvis default: on; explicit off is tested at the end
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-'));
process.env.DATA_FOLDER = dataDir;
const {loadOrCreateKey, sign, verify} = await import('../src/telemetry/directive.js');
const {Collector} = await import('../src/telemetry/collector.js');
const {Telemetry} = await import('../src/telemetry/client.js');
const {directiveBlock, activeDirective} = await import('../src/telemetry/enforce.js');
const { default: config } = await import('../src/config/config.js');
const { loadCommands, handleCommand } = await import('../src/handlers/commandHandler.js');
await loadCommands();

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dr-'));
const ID = (n) => String(n).repeat(24).slice(0, 24).replace(/[^a-f0-9]/g, 'a');
const ping = (n, extra = {}) => ({v: 1, id: ID(n), ver: '1.9.0', up: 10, on: true, cmds: {ping: 1}, ...extra});

test('verify: only the pinned key, own S-ID, unexpired, newer seq', () => {
  const k = loadOrCreateKey(path.join(tmp(), 'k.pem')); const other = loadOrCreateKey(path.join(tmp(), 'o.pem')); const now = Date.now();
  const d = {sid: 'S-AAAAAA', act: 'suspend', exp: now + 86400000, seq: 3};
  const s = sign(k.priv, d);
  assert.ok(verify(s, {pubkey: k.pub, sid: 'S-AAAAAA', lastSeq: 2, now}));
  assert.equal(verify(s, {pubkey: other.pub, sid: 'S-AAAAAA', now}), null, 'wrong key');
  assert.equal(verify(s, {pubkey: '', sid: 'S-AAAAAA', now}), null, 'no pinned key = ignore');
  assert.equal(verify(s, {pubkey: k.pub, sid: 'S-BBBBBB', now}), null, 'other install');
  assert.equal(verify(s, {pubkey: k.pub, sid: 'S-AAAAAA', lastSeq: 3, now}), null, 'replay');
  assert.equal(verify(s, {pubkey: k.pub, sid: 'S-AAAAAA', now: now + 2 * 86400000}), null, 'expired');
  assert.equal(verify(sign(k.priv, {...d, exp: now + 90 * 86400000}), {pubkey: k.pub, sid: 'S-AAAAAA', now}), null, 'too long');
  assert.equal(verify(sign(k.priv, {...d, act: 'limit', lim: 0}), {pubkey: k.pub, sid: 'S-AAAAAA', now}), null, 'bad limit');
  const tampered = {p: Buffer.from(JSON.stringify({...d, act: 'clear'})).toString('base64url'), s: s.s};
  assert.equal(verify(tampered, {pubkey: k.pub, sid: 'S-AAAAAA', now}), null, 'tampered payload');
  assert.equal(verify({p: 'x'.repeat(700), s: s.s}, {pubkey: k.pub, sid: 'S-AAAAAA', now}), null);
});

test('collector: owner exempt, directive travels in the reply, flags raised, key persists', () => {
  const dir = tmp(); let now = 1e12; const file = path.join(dir, 'c.json');
  const c = new Collector({file, ownerInstallId: ID(1), now: () => now});
  const sid = c.ingest(ping(2), '1.1.1.1').sid;
  assert.equal(c.ingest(ping(2), '1.1.1.1').dir, undefined);
  assert.equal(c.setDirective(c.db.installs[ID(1)].sid, 'suspend').ok, false, 'owner exempt');
  assert.equal(c.setDirective('S-ZZZZZZ', 'suspend').ok, false);
  assert.equal(c.setDirective(sid, 'suspend', 999).dir.days, 30);
  const r = c.ingest(ping(2), '1.1.1.1'); assert.ok(r.dir);
  const d = verify(r.dir, {pubkey: c.directivePublicKey, sid, now}); assert.equal(d.act, 'suspend'); assert.equal(d.seq, 1);
  assert.equal(c.reply(c.db.installs[ID(1)]).dir, undefined);
  c.setDirective(sid, 'limit', 7, 5); assert.equal(verify(c.reply(c.db.installs[ID(2)]).dir, {pubkey: c.directivePublicKey, sid, now, lastSeq: 1}).lim, 5);
  const again = new Collector({file, ownerInstallId: ID(1), now: () => now}); assert.equal(again.directivePublicKey, c.directivePublicKey);
  c.ingest(ping(3, {cmds: {ping: 3000}}), '2.2.2.2'); assert.equal(c.detail(c.db.installs[ID(3)].sid).flags[0].k, 'high-volume');
  for (let i = 4; i < 10; i++) c.ingest(ping(i), '3.3.3.3');
  assert.ok(Object.values(c.db.installs).some((i) => (i.flags || []).some((f) => f.k === 'many-installs-one-ip')));
  assert.ok(!(c.db.installs[ID(1)].flags || []).length);
});

test('client applies only a valid directive and refuses replays', async () => {
  const k = loadOrCreateKey(path.join(tmp(), 'k.pem')); const dir = tmp();
  const t = new Telemetry({dir, version: '1', pubkey: k.pub, fetchFn: async () => ({ok: true, json: async () => ({})})});
  const mkd = (seq, act = 'suspend') => sign(k.priv, {sid: 'S-AAAAAA', act, exp: Date.now() + 86400000, seq});
  assert.equal(t.applyDirective(mkd(1), 'S-AAAAAA'), true);
  assert.equal(activeDirective(dir).act, 'suspend');
  assert.equal(t.applyDirective(mkd(1, 'clear'), 'S-AAAAAA'), false, 'replay');
  assert.equal(t.applyDirective(mkd(2), 'S-BBBBBB'), false, 'wrong sid');
  assert.equal(t.applyDirective(mkd(2, 'clear'), 'S-AAAAAA'), true); assert.equal(activeDirective(dir), null);
  const unpinned = new Telemetry({dir: tmp(), version: '1', pubkey: '', fetchFn: null});
  assert.equal(unpinned.applyDirective(mkd(1), 'S-AAAAAA'), false);
});

test('enforcement: suspend blocks all but /sid; limit counts per sender', () => {
  const dir = tmp(); const w = (o) => fs.writeFileSync(path.join(dir, 'telemetry-directive.json'), JSON.stringify(o));
  assert.equal(directiveBlock('ping', 'u1', dir), null);
  w({act: 'suspend', exp: Date.now() + 5000, seq: 1}); assert.equal(directiveBlock('ping', 'u1', dir), 'suspended'); assert.equal(directiveBlock('sid', 'u1', dir), null);
  w({act: 'limit', lim: 2, exp: Date.now() + 5000, seq: 2});
  assert.equal(directiveBlock('ping', 'u2', dir), null); assert.equal(directiveBlock('ping', 'u2', dir), null); assert.equal(directiveBlock('ping', 'u2', dir), 'limited'); assert.equal(directiveBlock('ping', 'u3', dir), null);
  w({act: 'suspend', exp: Date.now() - 1, seq: 3}); assert.equal(directiveBlock('ping', 'u1', dir), null, 'expired');
});

test('dispatch: a suspended install refuses a real command through handleCommand', async () => {
  fs.writeFileSync(path.join(config.paths.data, 'telemetry-directive.json'), JSON.stringify({act: 'suspend', exp: Date.now() + 60000, seq: 1}));
  try {
    const sent = []; const sock = {user: {id: config.ownerNumber + ':7@s.whatsapp.net'}, sendMessage: async (to, b) => { sent.push(b.text); return {}; }};
    const mk = (sender, owner) => ({sock, msg: {key: {remoteJid: sender + '@s.whatsapp.net', id: 'x'}, pushName: 'T'}, jid: sender + '@s.whatsapp.net', sender, senderJid: sender + '@s.whatsapp.net', args: [], isGroup: false, isOwner: owner, commands: new Map(), reply: async (t) => { sent.push(String(t?.text ?? t)); return {}; }});
    await handleCommand(mk('919700000009', false), {name: 'ping', args: []});
    assert.ok(sent.some((m) => /suspended by the original Jarvis maintainer/.test(m)), sent.join('|'));
  } finally { fs.rmSync(path.join(config.paths.data, 'telemetry-directive.json'), {force: true}); }
});

test('Jarvis default: maintainer directives apply; explicit off disables them', async () => {
  const {directiveBlock, activeDirective, setDirective} = await import('../src/telemetry/enforce.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-off-'));
  setDirective.save(dir, {act: 'suspend', exp: Date.now() + 864e5, seq: 99});
  const prev = process.env.MAINTAINER_DIRECTIVES; delete process.env.MAINTAINER_DIRECTIVES;
  try {
    assert.equal(activeDirective(dir)?.act, 'suspend'); assert.equal(directiveBlock('ping', 'u', dir), 'suspended');
    process.env.MAINTAINER_DIRECTIVES = 'off';
    assert.equal(activeDirective(dir), null); assert.equal(directiveBlock('ping', 'u', dir), null);
    const t = new Telemetry({dir, version: '1', fetchFn: async () => ({ok: true, json: async () => ({})})});
    assert.equal(t.applyDirective('anything', 'S-ABC234'), false);
  } finally { if (prev === undefined) delete process.env.MAINTAINER_DIRECTIVES; else process.env.MAINTAINER_DIRECTIVES = prev; }
});
