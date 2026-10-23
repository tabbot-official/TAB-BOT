import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanWho} from '../src/utils/who.js';
import {page} from '../src/dashboard/page.js';
const base = {botName: 'J', wa: 'online', uptimeSec: 5, plugins: 1, totalCommands: 1, downloads: 0, failures: 0, usage: [], ramUsed: 1, ramLimit: 2, cpuPct: 0, diskFree: 1};
test('cleanWho never exposes phone numbers or markup', () => {
  assert.equal(cleanWho('Rohan'), 'Rohan'); assert.equal(cleanWho('+91 98765 43210'), 'Someone'); assert.equal(cleanWho('919876543210', true), 'Owner');
  assert.equal(cleanWho('a@s.whatsapp.net'), 'Someone'); assert.equal(cleanWho(''), 'Someone'); assert.equal(cleanWho('<b>x</b>'), 'bx/b');
  assert.ok(cleanWho('x'.repeat(100)).length <= 24);
});
test('recent activity renders command, who and time, newest first, escaped, no raw JSON', () => {
  const html = page({...base, recent: [{name: 'old', at: 1000, who: 'Asha'}, {name: 'new', at: 9000, who: '<img src=x>'}, {name: 'menu', at: 5000}]});
  const rows = [...html.matchAll(/<li class="act">(.*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(rows.length, 3); assert.match(rows[0], /\/new/); assert.match(rows[1], /\/menu/); assert.match(rows[2], /\/old.*by Asha/);
  assert.ok(!html.includes('<img src=x>')); assert.ok(!html.includes('{"name"')); assert.match(rows[0], /data-at="9000"/);
});
test('dashboard strings are English only', () => {
  const html = page({...base, recent: []});
  assert.ok(!/pehle|abhi|kar(o|na)|hai\b/i.test(html)); assert.match(html, /just now/); assert.match(html, /minute/);
});
