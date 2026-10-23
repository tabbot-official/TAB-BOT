import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseVersion, pickVersion, pickBrowser, normalizePairingNumber, rotateQrAdvSecret } from '../src/connection/pairingSetup.js';
import { applyBaileysPatches, resolvePackageDir } from '../scripts/patch-baileys.js';

test('parseVersion accepts dotted and comma forms only', () => {
  assert.deepEqual(parseVersion('2.3000.1051488527'), [2, 3000, 1051488527]);
  assert.deepEqual(parseVersion('2,3000,1'), [2, 3000, 1]);
  assert.equal(parseVersion('2.3000'), null);
  assert.equal(parseVersion('abc'), null);
});

test('pickVersion prefers WA_VERSION, then live web version, then baileys json', async () => {
  const lib = {
    fetchLatestWaWebVersion: async () => ({ version: [2, 3000, 222], isLatest: true }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 111], isLatest: true }),
  };
  assert.deepEqual((await pickVersion(lib, { env: { WA_VERSION: '2.3000.9' } })).version, [2, 3000, 9]);
  assert.deepEqual((await pickVersion(lib, { env: {} })).version, [2, 3000, 222]);
  const stale = { ...lib, fetchLatestWaWebVersion: async () => ({ version: [2, 3000, 1], isLatest: false, error: { message: 'x' } }) };
  const r = await pickVersion(stale, { env: {} });
  assert.deepEqual(r.version, [2, 3000, 111]);
  const broken = { fetchLatestWaWebVersion: async () => { throw new Error('net'); }, fetchLatestBaileysVersion: async () => { throw new Error('net'); } };
  assert.equal((await pickVersion(broken, { env: {} })).version, undefined);
});

test('pickBrowser: default macOS Chrome, ubuntu/windows, custom triple', () => {
  const B = { macOS: (b) => ['Mac OS', b, '14.4.1'], ubuntu: (b) => ['Ubuntu', b, '22.04.4'], windows: (b) => ['Windows', b, '10.0.22631'] };
  assert.deepEqual(pickBrowser(B, ''), ['Mac OS', 'Chrome', '14.4.1']);
  assert.deepEqual(pickBrowser(B, 'ubuntu'), ['Ubuntu', 'Chrome', '22.04.4']);
  assert.deepEqual(pickBrowser(B, 'WINDOWS'), ['Windows', 'Chrome', '10.0.22631']);
  assert.deepEqual(pickBrowser(B, 'Ubuntu, Chrome, 20.0.04'), ['Ubuntu', 'Chrome', '20.0.04']);
  assert.deepEqual(pickBrowser(undefined, 'ubuntu'), ['Ubuntu', 'Chrome', '22.04.4']);
});

test('normalizePairingNumber keeps digits with country code', () => {
  assert.equal(normalizePairingNumber('+91 62903-71061'), '916290371061');
  assert.equal(normalizePairingNumber('0091 6290371061'), '916290371061');
  assert.equal(normalizePairingNumber('123'), '');
  assert.equal(normalizePairingNumber(''), '');
});

test('rotateQrAdvSecret swaps only the adv field', () => {
  const qr = 'https://wa.me/settings/linked_devices#REF,NOISE,IDENT,OLDADV,1';
  assert.equal(rotateQrAdvSecret(qr, 'NEWADV'), 'https://wa.me/settings/linked_devices#REF,NOISE,IDENT,NEWADV,1');
  assert.equal(rotateQrAdvSecret('bad', 'x'), 'bad');
});

test('Baileys pairing patches apply to the installed build, are idempotent and keep the lib valid', () => {
  const src = resolvePackageDir('@whiskeysockets/baileys');
  assert.ok(src, 'baileys installed');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
  try {
    fs.cpSync(path.join(src, 'package.json'), path.join(tmp, 'package.json'));
    for (const f of ['lib/Socket/socket.js', 'lib/Socket/messages-recv.js', 'lib/Utils/validate-connection.js']) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.cpSync(path.join(src, f), path.join(tmp, f));
    }
    const before = fs.readFileSync(path.join(tmp, 'lib/Socket/socket.js'), 'utf8');
    const already = before.includes('tab-pairing-fix');
    const r1 = applyBaileysPatches({ dir: tmp });
    for (const x of r1.results) assert.ok(['applied', 'present'].includes(x.status), x.id + ' ' + x.status);
    if (!already) assert.equal(r1.results.filter((x) => x.status === 'applied').length >= 3, true);
    const r2 = applyBaileysPatches({ dir: tmp });
    assert.ok(r2.results.every((x) => x.status === 'present'), JSON.stringify(r2.results));
    const sock = fs.readFileSync(path.join(tmp, 'lib/Socket/socket.js'), 'utf8');
    assert.match(sock, /content: Buffer\.alloc\(1\)/);
    assert.doesNotMatch(sock, /link_code_pairing_nonce',\s*attrs: \{\},\s*content: '0'/);
    assert.match(sock, /creds\.pairingCode && !creds\.registered && !creds\.account/);
    const recv = fs.readFileSync(path.join(tmp, 'lib/Socket/messages-recv.js'), 'utf8');
    assert.match(recv, /primary_identity_pub'\) \|\| !getBinaryNodeChildBuffer\(linkCodeCompanionReg, 'link_code_pairing_wrapped_primary_ephemeral_pub'\)\) break;/);
    assert.match(fs.readFileSync(path.join(tmp, 'lib/Utils/validate-connection.js'), 'utf8'), /registered: true/);
    for (const f of ['lib/Socket/socket.js', 'lib/Socket/messages-recv.js', 'lib/Utils/validate-connection.js']) {
      execFileSync(process.execPath, ['--check', path.join(tmp, f)]);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('TAB_BAILEYS_PATCH=off skips patching', () => {
  const old = process.env.TAB_BAILEYS_PATCH;
  process.env.TAB_BAILEYS_PATCH = 'off';
  try { assert.equal(applyBaileysPatches({ dir: '/nonexistent' }).skipped, 'TAB_BAILEYS_PATCH=off'); }
  finally { if (old === undefined) delete process.env.TAB_BAILEYS_PATCH; else process.env.TAB_BAILEYS_PATCH = old; }
});
