import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Reminders} from '../src/utilities/reminders.js';
import sm from '../src/commands/sm.js';
import {scheduled} from '../src/ops/index.js';

test('scheduled messages persist, send plain text once and survive restart', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sm-')), 's.json'); let t = 1e12; const sent = [];
  const mk = () => new Reminders(f, async (x, to) => { sent.push([x, to]); return true; }, () => t, (x) => x);
  const a = mk(); a.create('happy birthday', t + 120000, '120363000000000001@g.us', '9199'); 
  const b = mk(); assert.equal(b.jobs.length, 1); t += 130000; await b.tick(); await b.tick();
  assert.deepEqual(sent, [['happy birthday', '120363000000000001@g.us']]);
});
test('/sm creates, lists and cancels', async () => {
  const out = []; const ctx = (args) => ({ args, jid: '120363000000000001@g.us', isGroup: true, senderJid: '919999999999@s.whatsapp.net', reply: async (m) => out.push(m) });
  scheduled.jobs = [];
  await sm.run(ctx(['2h', 'hello', 'team'])); assert.match(out.at(-1), /scheduled/);
  assert.equal(scheduled.jobs.length, 1); assert.equal(scheduled.jobs[0].text, 'hello team');
  await sm.run(ctx(['list'])); assert.match(out.at(-1), /hello team/);
  await sm.run(ctx(['cancel', scheduled.jobs[0].id])); assert.equal(scheduled.jobs.length, 0);
  await sm.run(ctx(['2h'])); assert.match(out.at(-1), /What should I send/);
});
