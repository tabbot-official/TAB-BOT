import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'op-')); const cwd = process.cwd();
process.env.DATA_FOLDER = tmp; process.chdir(tmp); fs.mkdirSync('data');
const root = cwd + '/src/';
const ops = await import(root + 'permissions/operators.js');
const sh = await import(root + 'utilities/ownershell.js');
const { handlePendingAnswer } = await import(root + 'commands/agent.js');
const { config } = await import(root + 'config.js').catch(() => ({ config: null }));
const NUM = '911234567890';
const setFile = (o) => fs.writeFileSync(path.join('data', 'agent-operators.json'), typeof o === 'string' ? o : JSON.stringify(o));
const idn = (n, v = true) => ({ verified: v, phoneNumber: n, senderJid: n + '@s.whatsapp.net' });
test('no file, bad json, bad numbers -> nobody is an operator', () => {
  assert.deepEqual(ops.operatorNumbers(), []);
  setFile('{nope'); assert.deepEqual(ops.operatorNumbers(), []);
  setFile({ numbers: ['abc', '123', '+0123456789012', NUM] }); assert.deepEqual(ops.operatorNumbers(), [NUM]);
});
test('operatorIdentity needs: listed + verified + private chat', () => {
  setFile({ numbers: [NUM] });
  assert.equal(ops.operatorIdentity(idn(NUM), 'private'), NUM);
  assert.equal(ops.operatorIdentity(idn(NUM, false), 'private'), null, 'unverified (e.g. unmapped LID) is refused');
  assert.equal(ops.operatorIdentity(idn(NUM), 'group'), null, 'groups are refused');
  assert.equal(ops.operatorIdentity(idn(NUM), 'self'), null);
  assert.equal(ops.operatorIdentity(idn('919999999999'), 'private'), null, 'unlisted number');
  assert.equal(ops.operatorIdentity({ verified: true, phoneNumber: null }, 'private'), null);
});
const dm = (extra = {}) => ({ isOwner: true, operator: NUM, sender: NUM, isGroup: false, jid: NUM + '@s.whatsapp.net', msg: { message: { conversation: 'x' } }, ...extra });
test('isVerifiedOwnerDM for operators: DM, not forwarded, sender equals the verified operator', () => {
  assert.equal(sh.isVerifiedOwnerDM(dm()), true);
  assert.equal(sh.isVerifiedOwnerDM(dm({ isGroup: true })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ jid: '1@g.us' })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ sender: '911111111111' })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ isOwner: false })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ msg: { message: { extendedTextMessage: { contextInfo: { isForwarded: true } } } } })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ msg: { message: { extendedTextMessage: { contextInfo: { forwardingScore: 2 } } } } })), false);
});
test('a message that merely claims to be an operator without the handler flag gets nothing', () => {
  assert.equal(sh.isVerifiedOwnerDM({ isOwner: false, sender: NUM, isGroup: false, jid: NUM + '@s.whatsapp.net', msg: {} }), false);
});
test('a staged confirmation only counts from the person who staged it', async () => {
  const replies = [];
  const opCtx = dm({ reply: async (t) => { replies.push(t); } });
  sh.actorStore.run({ actor: 'owner' }, () => sh.stage(['echo hi'], {}));
  assert.equal(await handlePendingAnswer(opCtx, false), false, 'operator cannot answer the owner\'s pending action');
  assert.ok(sh.getPending(), 'still pending');
  sh.clearPending();
  sh.actorStore.run({ actor: 'op:' + NUM }, () => sh.stage(['echo hi'], {}));
  assert.equal(sh.getPending().by, 'op:' + NUM);
  const ownerCtx = { isOwner: true, sender: String(config?.ownerNumber || '').replace(/\D/g, ''), isGroup: false, jid: 'x@s.whatsapp.net', msg: {}, reply: async () => {} };
  assert.equal(await handlePendingAnswer(ownerCtx, false), false, 'owner cannot answer the operator\'s pending action');
  assert.equal(await handlePendingAnswer(opCtx, false), true, 'the operator can cancel their own');
});
test('jobs created by an operator carry "by"; owner-created ones do not', async () => {
  const { execStep } = await import(root + 'commands/agent.js');
  const sched = path.join('data', 'agent-schedules.json');
  const results = [];
  await execStep(dm({ __goal: 'x' }), { type: 'schedule', cron: '0 3 * * *', goal: 'clean old logs' }, results);
  await execStep({ isOwner: true, jid: 'o@s.whatsapp.net', __goal: 'x' }, { type: 'schedule', cron: '0 4 * * *', goal: 'owner task' }, results);
  const list = JSON.parse(fs.readFileSync(fs.existsSync(sched) ? sched : path.join('data', fs.readdirSync('data').find((x) => /sched/i.test(x))), 'utf8'));
  assert.equal(list.find((e) => e.goal === 'clean old logs').by, NUM);
  assert.equal('by' in list.find((e) => e.goal === 'owner task'), false);
  (await import(root + 'commands/agent.js')).stopAllSchedules();
});
test('interrupted-task notices go to the creator (operator) DM; revoked operator falls back to owner; owner tasks to owner', async () => {
  const { resumeInterruptedTasks } = await import(root + 'commands/agent.js');
  const tasks = path.join('data', 'agent-tasks.json');
  fs.writeFileSync(tasks, JSON.stringify([
    { id: 'a1', goal: 'op task', status: 'running', resumeCount: 1, by: NUM },
    { id: 'b2', goal: 'owner task', status: 'running', resumeCount: 1 },
    { id: 'c3', goal: 'revoked task', status: 'running', resumeCount: 1, by: '919999999999' }]));
  const sent = []; const s = { sendMessage: async (j, c) => { sent.push([j, c.text]); return { key: {} }; } };
  await resumeInterruptedTasks(s);
  const to = (g) => sent.find((x) => x[1].includes(g))?.[0];
  assert.equal(to('op task'), NUM + '@s.whatsapp.net');
  assert.notEqual(to('owner task'), NUM + '@s.whatsapp.net');
  assert.notEqual(to('revoked task'), '919999999999@s.whatsapp.net');
  assert.equal(to('revoked task'), to('owner task'));
});
process.on('exit', () => { try { process.chdir(cwd); } catch {} });
test('reachability: an operator DM reaches the owner-only /agent branch (deterministic "permissions" subcommand, no AI/network)', async () => {
  const agent = (await import(root + 'commands/agent.js')).default;
  const out = [];
  const ctx = dm({ args: ['permissions'], reply: async (t) => { out.push(String(t)); return { key: {} }; }, sock: { sendMessage: async (j, c) => { out.push(String(c?.text || '')); return { key: {} }; } }, commands: [] });
  await agent.run(ctx);
  assert.ok(out.join('\n').length > 20, 'got a reply from the owner-only permissions report: ' + out.join('|').slice(0, 80));
  assert.doesNotMatch(out.join('\n'), /breather|could not make a safe plan|Planning/);
  assert.match(fs.readFileSync(path.join('data', 'agent-audit.log'), 'utf8'), /OPERATOR 90 \/agent permissions/);
});
