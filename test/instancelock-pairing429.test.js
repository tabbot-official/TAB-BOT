import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { staleReason, parseLock, looksLikeBot, procStat } from '../src/utilities/instancelock.js';
import { isRateLimitError, markPairingRateLimited, pairingRateLimit, clearPairingRateLimit } from '../src/connection/pairingSetup.js';

// Fake /proc: pid -> { ppid, start, argv }
function fakeProc(map) {
  return (p) => {
    const m = /^\/proc\/(\d+)\/(stat|cmdline)$/.exec(p); if (!m || !map[m[1]]) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const e = map[m[1]];
    if (m[2] === 'cmdline') return e.argv.join('\0') + '\0';
    const f = new Array(52).fill('0'); f[0] = 'S'; f[1] = String(e.ppid); f[19] = String(e.start);
    return `${m[1]} (${e.comm || 'node'}) ` + f.join(' ');
  };
}
const BOT = ['/usr/local/bin/node', '--max-old-space-size=200', 'scripts/runner.js'];
const live = () => true;

test('lock: pid of our own parent (tab-start.cjs reused the old pid) is stale', () => {
  const read = fakeProc({ 50: { ppid: 20, start: 900, argv: BOT }, 20: { ppid: 1, start: 800, argv: ['/usr/local/bin/node', 'tab-start.cjs'] }, 1: { ppid: 0, start: 1, argv: ['/bin/bash'] } });
  assert.match(staleReason({ pid: 20, start: 0 }, { self: 50, isAlive: live, linux: true, read }), /ancestor/);
  assert.match(staleReason({ pid: 1, start: 0 }, { self: 50, isAlive: live, linux: true, read }), /ancestor/);
});

test('lock: pid reused by a non-bot process (npm, sh) is stale', () => {
  const read = fakeProc({ 50: { ppid: 1, start: 900, argv: BOT }, 1: { ppid: 0, start: 1, argv: ['sh'] }, 33: { ppid: 1, start: 850, argv: ['npm', 'install'] } });
  assert.match(staleReason({ pid: 33, start: 0 }, { self: 50, isAlive: live, linux: true, read }), /non-bot/);
});

test('lock: same pid but a different start time is stale; matching start time blocks', () => {
  const read = fakeProc({ 50: { ppid: 1, start: 900, argv: BOT }, 1: { ppid: 0, start: 1, argv: ['sh'] }, 77: { ppid: 1, start: 860, argv: BOT } });
  assert.match(staleReason({ pid: 77, start: 123 }, { self: 50, isAlive: live, linux: true, read }), /start time/);
  assert.equal(staleReason({ pid: 77, start: 860 }, { self: 50, isAlive: live, linux: true, read }), '', 'a real second bot still blocks');
});

test('lock: old pid-only lock older than the process that now has that pid is stale', () => {
  const read = fakeProc({ 50: { ppid: 1, start: 900, argv: BOT }, 1: { ppid: 0, start: 1, argv: ['sh'] }, 77: { ppid: 1, start: 50000, argv: BOT } });
  // boot at t=1,000,000 ms; pid 77 started 500 s after boot; the lock file was written 100 s after boot.
  assert.match(staleReason({ pid: 77, start: 0 }, { self: 50, isAlive: live, linux: true, read, bootMs: 1_000_000, mtimeMs: 1_100_000, hz: 100 }), /younger/);
  assert.equal(staleReason({ pid: 77, start: 0 }, { self: 50, isAlive: live, linux: true, read, bootMs: 1_000_000, mtimeMs: 1_600_000, hz: 100 }), '');
});

test('lock: dead pid, empty file and our own pid never block', () => {
  assert.equal(staleReason({ pid: 9, start: 0 }, { self: 50, isAlive: () => false, linux: true }), 'dead');
  assert.equal(staleReason(parseLock(''), { self: 50 }), 'empty');
  assert.equal(staleReason({ pid: 50, start: 0 }, { self: 50 }), 'ours');
});

test('lock: parseLock reads old "pid" and new "pid start" formats; looksLikeBot', () => {
  assert.deepEqual(parseLock('1234'), { pid: 1234, start: 0 });
  assert.deepEqual(parseLock('1234 98765\n'), { pid: 1234, start: 98765 });
  assert.equal(looksLikeBot(BOT), true);
  assert.equal(looksLikeBot(['/usr/bin/node', '/home/container/src/index.js']), true);
  assert.equal(looksLikeBot(['/usr/local/bin/node', 'tab-start.cjs']), false);
  assert.equal(looksLikeBot(['/bin/sh', '-c', 'node scripts/runner.js']), false);
});

test('lock: real /proc on this box reads our own start time', { skip: process.platform !== 'linux' }, () => {
  const st = procStat(process.pid);
  assert.ok(st && st.start > 0 && st.ppid === process.ppid);
  assert.equal(staleReason({ pid: process.ppid, start: 0 }, { self: process.pid, linux: true }).startsWith('ancestor'), true);
});

test('pairing 429: Baileys rate-overlimit errors are recognised, others are not', () => {
  assert.equal(isRateLimitError(Object.assign(new Error('rate-overlimit'), { data: 429 })), true);
  assert.equal(isRateLimitError({ output: { statusCode: 429 }, message: 'x' }), true);
  assert.equal(isRateLimitError(new Error('rate-overlimit')), true);
  assert.equal(isRateLimitError(Object.assign(new Error('bad-request'), { data: 400 })), false);
  assert.equal(isRateLimitError(new Error('Connection Closed')), false);
});

test('pairing 429: the stop is remembered on disk across restarts, then expires or clears', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-rl-'));
  try {
    const now = 1_700_000_000_000;
    assert.equal(pairingRateLimit(dir, now).active, false);
    const until = markPairingRateLimited(dir, 'requestPairingCode: rate-overlimit', now, {});
    assert.equal(until, now + 4 * 3600e3, 'default 4 h');
    assert.equal(pairingRateLimit(dir, now + 3600e3).active, true);
    assert.equal(pairingRateLimit(dir, now + 5 * 3600e3).active, false);
    markPairingRateLimited(dir, 'x', now, { PAIRING_RATELIMIT_HOURS: '8' });
    assert.equal(pairingRateLimit(dir, now + 7 * 3600e3).active, true);
    clearPairingRateLimit(dir);
    assert.equal(pairingRateLimit(dir, now).active, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pairing 429: whatsapp.js parks idle (no exit, no reconnect) and logs the clear line', () => {
  const src = fs.readFileSync(new URL('../src/connection/whatsapp.js', import.meta.url), 'utf8');
  assert.match(src, /\[pairing\] WhatsApp rate limit \(429\): wait several hours, stopping code requests/);
  const park = src.slice(src.indexOf('async function parkPairing'), src.indexOf('async function requestPairing'));
  assert.ok(!/shutdown\(|process\.exit/.test(park), 'parking never exits (a panel would restart it and ask for another code)');
  assert.match(park, /setInterval/);
  assert.match(park, /!pairingRateLimit\(config\.paths\.data\)\.active\) markPairingRateLimited/, 'a restart inside the window keeps the original end time');
  const req = src.slice(src.indexOf('async function requestPairing'), src.indexOf('// Pairing portal hooks'));
  assert.match(req, /isRateLimitError\(err\)/);
  assert.ok(!/shutdown\(1\)/.test(req), 'too many attempts parks instead of exiting');
  assert.match(src, /if \(stopping \|\| pairingParked\) return;/, 'no reconnect once parked');
  assert.match(src, /pairingRateLimit\(config\.paths\.data\)\.active/, 'a restart inside the window does not open a socket');
});
