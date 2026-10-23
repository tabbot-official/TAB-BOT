import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
const {getToken, render} = await import('../src/dashboard/server.js');
test('token is stable, rotates, and is long', () => {
  const a = getToken(); assert.equal(a.length, 48); assert.equal(getToken(), a); assert.notEqual(getToken(true), a);
});
test('render escapes html', () => {
  const html = render({ botName: '<b>x</b>', wa: 'online', uptimeSec: 3700, ramUsed: 1e8, ramLimit: 5e8, cpuPct: 1, totalCommands: 3, downloads: 1, failures: 0, plugins: 5, diskFree: 1e9, usage: [['<img>', 2]], recent: [] });
  assert.ok(!html.includes('<img>') && !html.includes('<b>x</b>')); assert.match(html, /1h 1m/);
});
