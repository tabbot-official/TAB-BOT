import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, StepTimeout, TaskCancelled, beginTask, endTask, stopTasks, taskKey, activeTask, mutedCtx, runSteps, progressEditor, renderPlan, _resetTasks } from '../src/agent/runner.js';
import { runSafeMode, runStop, safeStepTimeoutMs, ownerStepTimeoutMs, whatsappText } from '../src/commands/agent.js';
import { execShell } from '../src/utilities/ownershell.js';
import { execSync } from 'node:child_process';

// Item 7 (Oct 24): plan -> run -> summary, step timeouts, a whole-task cap and ".agent stop".
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('withTimeout: value, timeout and cancel', async () => {
  assert.equal(await withTimeout(Promise.resolve(5), 100), 5);
  await assert.rejects(withTimeout(sleep(200), 20), StepTimeout);
  const ac = new AbortController();
  const p = withTimeout(sleep(200), 1000, ac.signal); setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, TaskCancelled);
  ac.abort(); await assert.rejects(withTimeout(Promise.resolve(1), 100, ac.signal), TaskCancelled, 'already stopped');
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 100), /boom/);
});

test('task registry: one task per chat+user; stop own vs owner stops the whole chat', () => {
  _resetTasks();
  const a = beginTask(taskKey('g1', 'u1@s.whatsapp.net'), 'x');
  assert.ok(a); assert.equal(beginTask(taskKey('g1', 'u1:5@s.whatsapp.net'), 'y'), null, 'device suffix is the same user');
  const b = beginTask(taskKey('g1', 'u2@s.whatsapp.net'), 'z');
  const c = beginTask(taskKey('g2', 'u1@s.whatsapp.net'), 'w');
  assert.equal(stopTasks('g1', 'u3@s.whatsapp.net'), 0, 'nobody else can stop your task');
  assert.equal(stopTasks('g1', 'u1@s.whatsapp.net'), 1); assert.equal(a.controller.signal.aborted, true);
  assert.equal(b.controller.signal.aborted, false);
  assert.equal(stopTasks('g1', 'owner', { allChat: true }), 1); assert.equal(b.controller.signal.aborted, true);
  assert.equal(c.controller.signal.aborted, false, 'other chats untouched');
  endTask(c); assert.equal(activeTask(c.key), null);
  const job = beginTask(taskKey('g3', 'own') + '#AGENTSCHED1', 'scheduled');
  assert.ok(beginTask(taskKey('g3', 'own'), 'owner task'), 'a scheduled job does not block the owner');
  assert.equal(stopTasks('g3', 'own', { allChat: true }), 2, 'the owner stop also stops the scheduled job');
  assert.equal(job.controller.signal.aborted, true);
  _resetTasks();
});

test('mutedCtx: replies and sendMessage are dropped once muted; other socket methods still work', async () => {
  const sent = []; let muted = false;
  const ctx = { jid: 'c', reply: async (t) => { sent.push('r:' + t); return 1; }, sock: { sendMessage: async (j, m) => { sent.push('s:' + m.text); return 2; }, user: { id: 'me' }, groupMetadata: async () => 'meta' } };
  const m = mutedCtx(ctx, () => muted);
  await m.reply('a'); await m.sock.sendMessage('c', { text: 'b' });
  assert.equal(m.sock.user.id, 'me'); assert.equal(await m.sock.groupMetadata(), 'meta');
  muted = true;
  assert.equal(await m.reply('late'), null); assert.equal(await m.sock.sendMessage('c', { text: 'late' }), null);
  assert.deepEqual(sent, ['r:a', 's:b']);
});

test('runSteps: a timed-out step is abandoned (late output muted) and the next step still runs', async () => {
  const out = [];
  const ctx = { reply: async (t) => { out.push(t); } };
  const progress = [];
  const r = await runSteps({
    steps: ['slow', 'fast', 'bad'], ctx, label: (s) => s,
    exec: async (s, c) => { if (s === 'slow') { await sleep(60); await c.reply('LATE from slow'); return { ok: true }; } if (s === 'bad') return { ok: false, text: 'no results' }; await c.reply('fast ok'); return { ok: true }; },
    stepTimeoutMs: (s) => (s === 'slow' ? 20 : 1000), totalCapMs: 5000,
    onProgress: async (rows, i) => progress.push(i),
  });
  await sleep(80);
  assert.deepEqual(r.rows.map((x) => x.status), ['timeout', 'ok', 'failed']);
  assert.match(r.rows[0].note, /timed out after 0 s/); assert.equal(r.rows[2].note, 'no results');
  assert.deepEqual(out, ['fast ok'], 'the abandoned step never posts after its timeout');
  assert.deepEqual(progress, [0, 1, 2]);
  assert.equal(r.cancelled, false); assert.equal(r.capped, false);
});

test('runSteps: stop mid-task cancels the running step and skips the rest; a throw is a failed step', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30);
  const r = await runSteps({ steps: ['a', 'b', 'c'], label: (s) => s, signal: ac.signal, exec: async (s) => { if (s === 'a') throw new Error('kaput'); await sleep(200); return { ok: true }; } });
  assert.deepEqual(r.rows.map((x) => x.status), ['failed', 'cancelled', 'skipped']);
  assert.equal(r.rows[0].note, 'kaput'); assert.equal(r.cancelled, true);
});

test('runSteps: the whole-task cap cuts the running step short and skips the rest', async () => {
  const r = await runSteps({ steps: ['a', 'b', 'c'], label: (s) => s, exec: async () => { await sleep(40); return { ok: true }; }, stepTimeoutMs: () => 10_000, totalCapMs: 60 });
  assert.equal(r.rows[0].status, 'ok'); assert.equal(r.rows[1].status, 'timeout'); assert.equal(r.rows[2].status, 'skipped');
  assert.equal(r.capped, true);
});

test('progressEditor: throttled single-message edits, identical text skipped, final render forced', async () => {
  let t = 0; const edits = [];
  const ed = progressEditor(async (x) => { edits.push(x); }, { minGapMs: 1000, now: () => t });
  await ed('a'); t = 100; await ed('b'); t = 1200; await ed('c'); await ed('c', { force: true }); t = 1300; await ed('final', { force: true });
  assert.deepEqual(edits, ['a', 'c', 'final']);
  assert.match(renderPlan('Plan:', [{ label: 'x', status: 'ok' }, { label: 'y', status: 'timeout', note: 'timed out after 30 s' }], { footer: 'f' }), /1\. ✅ x\n2\. ⌛ y - timed out after 30 s\n\nf/);
});

test('step limits: web 30 s, media 4 min, owner shell 75 s / commands 5 min', () => {
  assert.equal(safeStepTimeoutMs({ type: 'tool', tool: 'search' }), 30_000);
  assert.equal(safeStepTimeoutMs({ type: 'tool', tool: 'video' }), 240_000);
  assert.equal(safeStepTimeoutMs({ cmd: 'weather' }), 60_000);
  assert.equal(ownerStepTimeoutMs({ type: 'sh' }), 75_000);
  assert.equal(ownerStepTimeoutMs({ type: 'cmd' }), 300_000);
});

function chat() {
  const msgs = []; let id = 0;
  const sock = { sendMessage: async (jid, m) => { msgs.push(m.edit ? { edit: m.edit.id, text: m.text } : { text: m.text }); return { key: { id: 'k' + (++id) } }; } };
  const ctx = { jid: 'chat1@s.whatsapp.net', sender: 'user9@s.whatsapp.net', isOwner: false, sock, args: [], reply: async (t) => { msgs.push({ text: String(t) }); return { key: { id: 'k' + (++id) } }; } };
  return { ctx, msgs };
}
const planAi = (plan, answer = 'Answer from findings. Sources: a.com') => async (prompt) => ({ text: /What I found/.test(prompt) ? answer : JSON.stringify(plan) });

test('.agent (everyone): numbered plan first, progress as edits of ONE message, then one summary', async () => {
  _resetTasks();
  const { ctx, msgs } = chat();
  const plan = [{ search: 'IPL final 2026' }, { read: 'result:1' }, { song: 'Kesariya' }];
  const runStep = async (c, step) => { if (step.tool === 'song') { await c.reply('[audio]'); return { ok: true, text: 'sent' }; } return { ok: true, text: 'ok', finding: { label: step.tool, text: 'data ' + step.tool } }; };
  await runSafeMode(ctx, 'who won the IPL final and send kesariya', { ai: planAi(plan), runStep });
  assert.equal(msgs[0].text, '🤖 Planning...');
  assert.match(msgs[1].text, /^🤖 Plan \(3 steps\):\n1\. ▫️ web search: IPL final 2026\n2\. ▫️ read a web page: result:1\n3\. ▫️ song download: Kesariya\n\nSend \.agent stop to cancel\.$/);
  assert.equal(msgs[1].edit, 'k1', 'the plan replaces the Planning message');
  const fresh = msgs.filter((m) => !m.edit).map((m) => m.text);
  assert.deepEqual(fresh.slice(1, 2), ['[audio]']);
  assert.match(fresh.at(-1), /^✅ Done - 3\/3 steps in \d+ s\.\n\nAnswer from findings\. Sources: a\.com$/);
  assert.ok(msgs.filter((m) => m.edit).every((m) => m.edit === 'k1'), 'all progress is edits of the first message');
  assert.match(msgs.filter((m) => m.edit).at(-1).text, /^✅ Done \(3\/3 steps/);
  assert.equal(activeTask(taskKey(ctx.jid, ctx.sender)), null, 'task released');
});

test('.agent stop cancels a running task; a second .agent while one runs is refused', async () => {
  _resetTasks();
  const { ctx, msgs } = chat();
  const plan = [{ search: 'a' }, { video: 'long video' }, { search: 'c' }];
  const runStep = async (c, step) => { if (step.tool === 'video') { await sleep(150); await c.reply('LATE VIDEO'); } return { ok: true, text: 'ok' }; };
  const p = runSafeMode(ctx, 'goal', { ai: planAi(plan), runStep });
  await sleep(30);
  const second = chat(); second.ctx.sender = ctx.sender; second.ctx.jid = ctx.jid;
  await runSafeMode(second.ctx, 'another', { ai: planAi(plan), runStep });
  assert.match(second.msgs[0].text, /still working on your last \.agent task/);
  const stopper = chat(); stopper.ctx.sender = ctx.sender; stopper.ctx.jid = ctx.jid;
  await runStop(stopper.ctx);
  assert.match(stopper.msgs[0].text, /Stopped the running task/);
  await p; await sleep(200);
  const texts = msgs.map((m) => m.text).join('\n');
  assert.ok(!texts.includes('LATE VIDEO'), 'nothing from the stopped step arrives');
  assert.match(msgs.at(-1).text, /^⏹️ Stopped by you - 1\/3 steps/);
  assert.match(msgs.filter((m) => m.edit).at(-1).text, /2\. ⏹️ video download: long video\n3\. ⏭️ web search: c/);
  const none = chat(); await runStop(none.ctx);
  assert.match(none.msgs[0].text, /Nothing is running/);
  _resetTasks();
});

test('.agent: step timeout and time cap are reported in the summary', async () => {
  _resetTasks();
  const { ctx, msgs } = chat();
  const plan = [{ image: 'cat' }, { search: 'b' }];
  const runStep = async (c, step) => { if (step.tool === 'image') { await sleep(100); await c.reply('LATE IMAGE'); } return { ok: true, text: 'ok' }; };
  await runSafeMode(ctx, 'goal', { ai: planAi(plan), runStep, stepTimeoutMs: (s) => (s.tool === 'image' ? 20 : 1000) });
  await sleep(120);
  const last = msgs.at(-1).text;
  assert.match(last, /^⚠️ Finished with problems - 1\/2 steps/);
  assert.match(last, /Step 1 \(image generation: cat\): timed out after 0 s/);
  assert.ok(!msgs.some((m) => m.text === 'LATE IMAGE'));
  _resetTasks();
});

// "[s]leep ..." never matches the pgrep/sh command line that carries the pattern itself
const alive = (tag) => { try { return execSync('pgrep -f ' + JSON.stringify('[' + tag[0] + ']' + tag.slice(1).replace(/\./g, '[.]')) + ' || true').toString().trim().length > 0; } catch { return false; } };
test('owner shell step: a stop or a timeout kills the whole process tree (no orphan left running)', { skip: process.platform === 'win32' }, async () => {
  const tagA = 'sleep 31.' + process.pid, tagB = 'sleep 32.' + process.pid;
  const ac = new AbortController();
  const p = execShell(tagA.replace('sleep ', 'sleep ') + ' ; echo after', { signal: ac.signal });
  await sleep(150); assert.equal(alive(tagA), true);
  ac.abort();
  const r = await p;
  assert.equal(r.code, 130); assert.match(r.out, /\[stopped\]/); assert.ok(!/after/.test(r.out));
  await sleep(100); assert.equal(alive(tagA), false, 'sleep child killed with its shell');
  const r2 = await execShell(tagB, { timeoutMs: 200 });
  assert.equal(r2.code, 124); assert.match(r2.out, /timed out after 0 s/);
  await sleep(100); assert.equal(alive(tagB), false);
  const ok = await execShell('echo hi');
  assert.equal(ok.code, 0); assert.equal(ok.out.trim(), 'hi');
});

test('AI markdown becomes WhatsApp text', () => {
  assert.equal(whatsappText('## Head\nUse **Node 24** now'), 'Head\nUse *Node 24* now');
});
