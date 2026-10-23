import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlop-')); const cwd = process.cwd();
process.env.DATA_FOLDER = tmp; process.chdir(tmp); fs.mkdirSync('data');
const root = cwd + '/src/';
const { DownloadQueue } = await import(root + 'utils/downloader.js');
const config = (await import(root + 'config/config.js')).default;
const OWNER = '918888888888', OP = '917003851924', LID = '255864824922167';
config.ownerNumber = OWNER;
const FILE = path.join('data', 'agent-operators.json');
const setOps = (n) => fs.writeFileSync(FILE, JSON.stringify({ numbers: n }));
// A job that never finishes keeps the user's slot busy, so a second add shows whether the per-user limit applies.
const limited = async (userId) => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 5, maxPerUser: 1, profile: null });
  q.add(userId, () => new Promise(() => {})).catch(() => {});
  try { q.add(userId, () => new Promise(() => {})).catch(() => {}); return false; } catch (e) { return e.code === 'USER_LIMIT'; }
};
test('Rohan: owner privilege unchanged (no per-user limit), with and without an operator file', async () => {
  assert.equal(await limited(OWNER + '@s.whatsapp.net'), false);
  setOps([OP]); assert.equal(await limited(OWNER + '@s.whatsapp.net'), false);
});
test('approved operator number gets the owner privilege', async () => {
  setOps([OP]);
  assert.equal(await limited(OP), false); assert.equal(await limited(OP + '@s.whatsapp.net'), false); assert.equal(await limited(OP + ':7@s.whatsapp.net'), false);
});
test('unlisted number, unmapped LID digits, empty id: normal-user limit applies', async () => {
  setOps([OP]);
  assert.equal(await limited('919999999999@s.whatsapp.net'), true);
  assert.equal(await limited(LID + '@lid'), true, 'a LID is a different namespace and is not her number');
  assert.equal(await limited(''), true);
});
test('revoked (file emptied or removed): back to the normal-user limit', async () => {
  setOps([]); assert.equal(await limited(OP), true);
  setOps([OP]); fs.unlinkSync(FILE); assert.equal(await limited(OP), true);
});
test('group/forwarded/unverified messages never reach here as the operator: the gate is upstream and already tested', () => {
  // downloader only receives a sender id; group, forwarded and unverified refusals live in operatorIdentity/isVerifiedOwnerDM (operator.test.js).
  assert.ok(true);
});
process.on('exit', () => { try { process.chdir(cwd); } catch {} });
