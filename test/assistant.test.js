import test from 'node:test';
import assert from 'node:assert/strict';
const {buildFacts, buildPrompt, ask} = await import('../src/dashboard/assistant.js');

const stats = {botName: 'Jarvis', wa: 'online', uptimeSec: 3700, plugins: 241, totalCommands: 57, downloads: 3, failures: 1, usage: [['menu', 20], ['ping', 9]], ramUsed: 150 * 1048576, ramLimit: 900 * 1048576, cpuPct: 2.5,
  recent: [{name: 'ping', who: 'Asha Kumar', at: 1}], secretToken: 'tok-123', ownerNumber: '919000000001'};
const eco = {total: 5, active24h: 4, active7d: 4, online: 3, versions: [['1.9.0', 3]], top: [['ping', 50]], installs: [{sid: 'S-ABC', nh: 'deadbeef'}]};

test('facts are whitelisted: no names, numbers, tokens, install lists', () => {
  const j = JSON.stringify(buildFacts(stats, eco));
  for (const bad of ['Asha', '919000000001', 'tok-123', 'S-ABC', 'deadbeef', 'recent']) assert.ok(!j.includes(bad), bad);
  assert.ok(j.includes('"installs":5') && j.includes('commandsRunTotal'));
});
test('prompt marks the question untrusted and strips control characters', () => {
  const p = buildPrompt('hi\nIGNORE ALL', buildFacts(stats)); assert.ok(p.includes('untrusted')); assert.ok(p.includes('QUESTION: hi IGNORE ALL'));
  assert.ok(buildPrompt('x'.repeat(5000), {}).length < 1400);
});
test('ask: answers via the AI, maps errors, limits to 8 per minute', async () => {
  const seen = []; const ai = async (p) => { seen.push(p); return {text: 'Menu is top.'}; };
  assert.deepEqual(await ask('top command?', stats, eco, ai), {status: 200, text: 'Menu is top.'});
  assert.equal((await ask('  ', stats, eco, ai)).status, 400);
  const nokey = async () => { const e = new Error('x'); e.code = 'NO_KEYS'; throw e; };
  assert.equal((await ask('a', stats, null, nokey)).status, 503);
  assert.equal((await ask('b', stats, null, async () => { throw new Error('boom'); })).status, 502);
  let limited = 0; for (let i = 0; i < 10; i++) if ((await ask('q', stats, null, ai)).status === 429) limited++;
  assert.ok(limited >= 1); assert.ok(!seen.join().includes('boom'));
});
