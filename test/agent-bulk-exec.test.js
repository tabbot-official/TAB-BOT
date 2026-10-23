import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'abulk-'));
const { execStep } = await import('../src/commands/agent.js');
const q = await import('../src/utilities/agentqueue.js');
const QF = path.join('data', 'agent-queue.json');
const run = async (goal, items) => { const results = []; await execStep({ jid: 'c@s.whatsapp.net', __goal: goal }, { type: 'bulk', cmd: 'play', items }, results); return results[0]; };
test('planner dropped items from a clean numbered media list: all listed items are queued', async () => {
  const r = await run('download these songs 1. a 2. b 3. c 4. d 5. e', ['a', 'b', 'c']);
  assert.equal(r.code, 0); assert.match(r.out, /Queued 5 downloads.*all 5 items you listed/);
});
test('gapped numbering: rejected, nothing queued (contract changed from warn-and-run on purpose)', async () => {
  const before = (q.failedItems && true, JSON.stringify(fs.existsSync(QF) ? fs.readFileSync(QF, 'utf8') : ''));
  const r = await run('download songs 1. a 2. b 4. d 5. e', ['a', 'b', 'd', 'e']);
  assert.equal(r.code, 1); assert.match(r.out, /Not queued.*gaps, repeats or empty items.*Nothing was started/);
  const after = JSON.stringify(fs.existsSync(QF) ? fs.readFileSync(QF, 'utf8') : '');
  assert.equal(after, before);
});
test('receipt count equals the items actually present at the end of the queue file', async () => {
  const r = await run('download these songs 1. p 2. q 3. r', ['p', 'q', 'r']);
  assert.equal(r.code, 0); assert.match(r.out, /Queued 3 downloads.*verified in queue: (\d+) items total, 3 added/);
  const file = JSON.parse(fs.readFileSync(QF, 'utf8'));
  assert.deepEqual(file.items.slice(-3).map((x) => x.args), ['p', 'q', 'r']);
  assert.equal(Number(r.out.match(/(\d+) items total/)[1]), file.items.length);
});
test('numbered prose without media intent does not override the planner', async () => {
  const r = await run('summarise 1. intro 2. body 3. ending', ['x', 'y']);
  assert.match(r.out, /Queued 2 downloads/); assert.doesNotMatch(r.out, /items you listed/);
});
test('over the per-request limit is rejected, nothing queued', async () => {
  const r = await run('download songs', Array.from({ length: 1001 }, (_, i) => 's' + i));
  assert.equal(r.code, 1); assert.match(r.out, /1001 items is over the 1000 per request limit.*Nothing was started/);
});

test('1000 items accepted with verified receipt, queue file intact; 1500 pending cap rejects with nothing added', async () => {
  const fresh = path.join('data', 'agent-queue.json'); try { fs.unlinkSync(fresh); } catch {}
  const items = Array.from({ length: 1000 }, (_, i) => 'song ' + i);
  const r = await run('download songs', items);
  assert.equal(r.code, 0); assert.match(r.out, /Queued 1000 downloads.*verified in queue: 1000 items total, 1000 added/);
  const f = JSON.parse(fs.readFileSync(fresh, 'utf8'));
  assert.equal(f.items.length, 1000); assert.equal(new Set(f.items.map((x) => x.args)).size, 1000);
  const before = fs.readFileSync(fresh, 'utf8');
  const r2 = await run('download songs', Array.from({ length: 600 }, (_, i) => 'more ' + i));
  assert.equal(r2.code, 1); assert.match(r2.out, /1000 items are still pending and adding 600 would pass the 1500 pending limit.*Nothing was started/);
  assert.equal(fs.readFileSync(fresh, 'utf8'), before);
  // mocked cost of the queue's per-item load+save cycle at this size (one pass = what the runner does per item)
  const t0 = Date.now(); for (let i = 0; i < 200; i++) { const q = JSON.parse(fs.readFileSync(fresh, 'utf8')); q.items[i].status = 'done'; fs.writeFileSync(fresh, JSON.stringify(q)); }
  const per = (Date.now() - t0) / 200; assert.ok(per < 50, 'load+save per item ms: ' + per); console.log('# queue load+save per item at 1000 items: ' + per.toFixed(2) + ' ms (mocked, not a live run)');
  try { fs.unlinkSync(fresh); } catch {}
});
