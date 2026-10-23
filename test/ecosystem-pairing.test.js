import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPairing, createProofRelay, safeUrl, loadSaved, PROOF_PREFIX } from '../src/ecosystem/pairing.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'eco-'));
const ok = (data) => ({ ok: true, json: async () => ({ success: true, data }) });
const eco = { portalUrl: 'https://portal.example/portal', ticket: 'T-abc', number: '919876543210' };

test('safeUrl: https or localhost only', () => {
  assert.equal(safeUrl('https://a.example/portal/'), 'https://a.example/portal');
  assert.equal(safeUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(safeUrl('http://evil.example'), ''); assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl(''), '');
});
test('inactive without portalUrl or ticket: no network call', async () => {
  let calls = 0; const p = createPairing({ eco: { sid: '', number: '1', portalUrl: '', ticket: '' }, dir: tmp(), fetchFn: async () => { calls++; return ok({}); }, sendText() {}, sendSelf() {} });
  assert.equal(p.active(), false); assert.equal(await p.relayCode('ABCD1234'), false); assert.equal(await p.onLinked(), null); assert.equal(calls, 0);
});
test('relayCode posts only token, number and code', async () => {
  const seen = []; const p = createPairing({ eco, dir: tmp(), fetchFn: async (u, o) => { seen.push([u, JSON.parse(o.body)]); return ok({ ok: true }); }, sendText() {}, sendSelf() {} });
  assert.equal(await p.relayCode('ABCD1234'), true);
  assert.deepEqual(seen, [['https://portal.example/portal/pair/bot/code', { token: 'T-abc', number: '919876543210', code: 'ABCD1234' }]]);
});
test('onLinked: sends proof to maintainer, then saves S-ID and DMs it to own chat', async () => {
  const dir = tmp(), texts = [], selfs = []; let polls = 0, applied = '';
  const fetchFn = async (u) => { if (u.endsWith('/pair/bot/linked')) return ok({ status: 'linked', proof: 'PX-ABCDEFGHJK', proofTo: '919111111111' }); polls++; return ok(polls < 3 ? { status: 'linked' } : { status: 'verified', sid: 'S-7K2Q9F' }); };
  const p = createPairing({ eco, dir, fetchFn, pollMs: 1, sendText: async (n, t) => texts.push([n, t]), sendSelf: async (t) => selfs.push(t), applySid: (s) => { applied = s; } });
  assert.equal(await p.onLinked(), 'S-7K2Q9F');
  assert.deepEqual(texts, [['919111111111', PROOF_PREFIX + 'PX-ABCDEFGHJK']]);
  assert.match(selfs[0], /S-7K2Q9F/); assert.equal(applied, 'S-7K2Q9F'); assert.equal(loadSaved(dir), 'S-7K2Q9F');
});
test('already paired (saved S-ID): no more portal calls', async () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'ecosystem.json'), JSON.stringify({ sid: 'S-ABCDEF' })); let calls = 0;
  const p = createPairing({ eco, dir, fetchFn: async () => { calls++; return ok({}); }, sendText() {}, sendSelf() {} });
  assert.equal(await p.relayCode('ABCD1234'), false); assert.equal(await p.onLinked(), null); assert.equal(calls, 0);
});
test('portal failure never throws and sends no S-ID', async () => {
  const selfs = []; const p = createPairing({ eco, dir: tmp(), fetchFn: async () => ({ ok: false, json: async () => ({ success: false, error: { code: 'bad_ticket' } }) }), sendText() {}, sendSelf: async (t) => selfs.push(t), pollMs: 1 });
  assert.equal(await p.relayCode('ABCD1234'), false); assert.equal(await p.onLinked(), null); assert.equal(selfs.length, 0);
});
test('a malformed S-ID from the portal is rejected', async () => {
  const dir = tmp(); const fetchFn = async (u) => (u.endsWith('/linked') ? ok({ proof: 'PX-ABCDEFGHJK', proofTo: '1' }) : ok({ status: 'verified', sid: 'bad<script>' }));
  const p = createPairing({ eco, dir, fetchFn, pollMs: 1, maxPolls: 2, sendText() {}, sendSelf() {} }); assert.equal(await p.onLinked(), null); assert.equal(loadSaved(dir), '');
});
test('proof relay: only on the maintainer install, only valid proof text, resolved number required', async () => {
  const seen = []; const fetchFn = async (u, o) => { seen.push([u, o.headers['x-proof-key'], JSON.parse(o.body)]); return { ok: true }; };
  assert.equal(await createProofRelay({ env: {}, fetchFn })('JARVIS-PROOF PX-ABCDEFGHJK', '919876543210'), false);
  const r = createProofRelay({ env: { PORTAL_URL: 'https://portal.example/portal', PORTAL_PROOF_KEY: 'secretkey' }, fetchFn });
  assert.equal(await r('hello', '919876543210'), false); assert.equal(await r('JARVIS-PROOF x', '919876543210'), false); assert.equal(await r('JARVIS-PROOF PX-ABCDEFGHJK', ''), false);
  assert.equal(seen.length, 0);
  assert.equal(await r('JARVIS-PROOF PX-ABCDEFGHJK', '919876543210'), true);
  assert.deepEqual(seen, [['https://portal.example/portal/pair/proof', 'secretkey', { proof: 'PX-ABCDEFGHJK', from: '919876543210' }]]);
});
test('settings: ecosystem.portalUrl and ticket are kept as plain strings', async () => {
  const { default: s } = await import('../src/config/settings.js'); assert.equal(typeof s.ecosystem.portalUrl, 'string'); assert.equal(typeof s.ecosystem.ticket, 'string');
});

import { createHeartbeat } from '../src/ecosystem/pairing.js';
test('heartbeat only posts while connected, with the proof key and version', async () => {
  const calls = []; const f = async (u, o) => { calls.push({u, h: o.headers['x-proof-key'], b: o.body}); return {ok: true}; };
  const hb = createHeartbeat({env: {PORTAL_URL: 'https://p.example/portal', PORTAL_PROOF_KEY: 'k'}, fetchFn: f, version: '2.1.0', intervalMs: 1e9});
  assert.equal(await hb.beat(), false); assert.equal(calls.length, 0);
  hb.setConnected(true); await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 1); assert.equal(calls[0].u, 'https://p.example/portal/bot/heartbeat'); assert.equal(calls[0].h, 'k'); assert.deepEqual(JSON.parse(calls[0].b), {version: '2.1.0'});
  hb.setConnected(false); assert.equal(await hb.beat(), false);
  const off = createHeartbeat({env: {}, fetchFn: f}); off.setConnected(true); assert.equal(calls.length, 1);
});

import { cleanCode, redeemCode, loadTicket } from '../src/ecosystem/pairing.js';
test('paste-free pairing: redeem stores the ticket, rejects bad codes, onLinked uses it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-')); const eco = {sid: '', number: '', portalUrl: 'https://p.example/portal', ticket: ''}; const calls = [];
  const f = async (u, o) => { calls.push({u, b: JSON.parse(o.body)}); if (u.endsWith('/pair/redeem')) return {json: async () => (calls.at(-1).b.code === 'K7QM4X2P' ? {success: true, data: {token: 'T-abc'}} : {success: false, error: {message: 'Unknown'}})}; if (u.endsWith('/pair/bot/linked')) return {json: async () => ({success: true, data: {status: 'linked', proof: 'PX-ABCDEFGHJK', proofTo: '919111111111'}})}; if (u.endsWith('/pair/bot/status')) return {json: async () => ({success: true, data: {status: 'verified', sid: 'S-ABC234'}})}; return {json: async () => ({success: true, data: {}})}; };
  assert.equal(cleanCode('k7qm-4x2p'), 'K7QM4X2P'); assert.equal(cleanCode('nope'), '');
  { const r0 = await redeemCode({eco: {portalUrl: ''}, dir, code: 'ZZZZ-ZZZZ', number: '919876543210', fetchFn: f}); assert.equal(r0.ok, false, 'Jarvis default portal responds to code'); assert.match(calls[0].u, /^https:\/\/3-110-115-23\.sslip\.io\/portal\/pair\/redeem$/); calls.length = 0; }
  assert.equal((await redeemCode({eco, dir, code: 'bad', number: '919876543210', fetchFn: f})).ok, false); assert.equal(calls.length, 0);
  assert.equal((await redeemCode({eco, dir, code: 'ZZZZ-ZZZZ', number: '919876543210', fetchFn: f})).ok, false); assert.equal(eco.ticket, '');
  const r = await redeemCode({eco, dir, code: 'k7qm-4x2p', number: '+91 98765 43210', fetchFn: f}); assert.equal(r.ok, true);
  assert.match(calls.at(-1).u, /^https:\/\/.*\/pair\/redeem$/); assert.deepEqual(calls.at(-1).b, {code: 'K7QM4X2P', number: '919876543210'});
  assert.deepEqual(loadTicket(dir), {token: 'T-abc', number: '919876543210'}); assert.equal(fs.statSync(path.join(dir, 'ecosystem-ticket.json')).mode & 0o077, 0);
  const sent = [], self = []; const p = createPairing({eco, dir, fetchFn: f, sendText: async (n, t) => sent.push([n, t]), sendSelf: async (t) => self.push(t), pollMs: 1});
  assert.equal(p.active(), true); const sid = await p.onLinked(); assert.equal(sid, 'S-ABC234'); assert.deepEqual(sent, [['919111111111', 'JARVIS-PROOF PX-ABCDEFGHJK']]); assert.match(self[0], /S-ABC234/);
  const idle = createPairing({eco: {portalUrl: '', ticket: '', number: ''}, dir, fetchFn: f, sendText() {}, sendSelf() {}}); assert.equal(idle.active(), false);
});

import { mintCode } from '../src/ecosystem/pairing.js';
test('mintCode: maintainer env only, sends the key header, validates the number', async () => {
  const calls = []; const f = async (u, o) => { calls.push({u, h: o.headers['x-proof-key'], b: JSON.parse(o.body)}); return {json: async () => ({success: true, data: {short: 'AAAA-BBBB', shortMinutes: 15}})}; };
  assert.equal((await mintCode({env: {}, number: '919876543210', fetchFn: f})).ok, false); assert.equal(calls.length, 0);
  const env = {PORTAL_URL: 'https://p.example/portal', PORTAL_PROOF_KEY: 'k'};
  assert.equal((await mintCode({env, number: '123', fetchFn: f})).ok, false); assert.equal(calls.length, 0);
  const r = await mintCode({env, number: '+91 98765 43210', fetchFn: f}); assert.deepEqual(r, {ok: true, short: 'AAAA-BBBB', minutes: 15});
  assert.equal(calls[0].u, 'https://p.example/portal/pair/mint'); assert.equal(calls[0].h, 'k'); assert.deepEqual(calls[0].b, {number: '919876543210'});
});

import { createStatusBeat, noteCommand, commandsToday, saveSid, loadKey } from '../src/ecosystem/pairing.js';
test('status beat: counters only, needs sid + key, respects the off switch, stops when disconnected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-')); const calls = []; const f = async (u, o) => { calls.push({u, b: JSON.parse(o.body)}); return {ok: true}; };
  { const noPortal = createStatusBeat({eco: {portalUrl: '', statusBeat: true}, dir: fs.mkdtempSync(path.join(os.tmpdir(), 'jb0-')), env: {}, fetchFn: f, intervalMs: 1e9}); assert.equal(await noPortal.beat(), false); }
  const eco = {portalUrl: 'https://p.example/portal', statusBeat: true}; const mk = (env = {}, e = eco) => createStatusBeat({eco: e, dir, env, fetchFn: f, version: '2.1.0', hosting: () => 'aws', intervalMs: 1e9});
  let b = mk(); b.setConnected(true); await new Promise((r) => setTimeout(r, 10)); assert.equal(calls.length, 0, 'no sid/key yet'); b.setConnected(false);
  saveSid(dir, 'S-ABC234', 'K-' + 'a'.repeat(32)); assert.equal(loadKey(dir), 'K-' + 'a'.repeat(32)); saveSid(dir, 'S-ABC234'); assert.equal(loadKey(dir).length, 34, 'key survives a re-save of the same sid');
  noteCommand(); noteCommand(); assert.equal(commandsToday(), 2); assert.equal(commandsToday(new Date(Date.now() + 2 * 864e5)), 0);
  b = mk(); assert.equal(await b.beat(), false, 'not connected'); b.setConnected(true); await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 1); assert.match(calls[0].u, /^https:\/\/.*\/pair\/beat$/);
  assert.deepEqual(Object.keys(calls[0].b).sort(), ['commandsToday', 'hosting', 'key', 'ramMb', 'sid', 'uptimeSec', 'version']); assert.equal(calls[0].b.commandsToday, 2); assert.equal(calls[0].b.hosting, 'aws');
  b.setConnected(false); assert.equal(await b.beat(), false);
  const off1 = mk({STATUS_BEAT: 'off'}); off1.setConnected(true); await new Promise((r) => setTimeout(r, 10)); assert.equal(calls.length, 1);
  const off2 = mk({}, {portalUrl: '', statusBeat: false}); off2.setConnected(true); await new Promise((r) => setTimeout(r, 10)); assert.equal(calls.length, 1);
});

test('claimSession: collects the prepared session, writes safe files, saves S-ID and key, falls back cleanly', async () => {
  const { claimSession } = await import('../src/ecosystem/pairing.js');
  const auth = path.join(tmp(), 'auth'), data = tmp();
  const e = { sid: 'S-ABC234', number: '919876543210', portalUrl: 'https://portal.example/portal' };
  const calls = []; const f = (u, o) => { calls.push({ u, b: JSON.parse(o.body) }); return Promise.resolve(ok({ blob: JSON.stringify({ v: 1, files: { 'creds.json': Buffer.from('{"a":1}').toString('base64'), 'app-state-sync-key-1.json': 'eA==' } }), key: 'K-' + 'a'.repeat(30) })); };
  const r = await claimSession({ eco: e, authDir: auth, dataDir: data, fetchFn: f });
  assert.equal(r.ok, true); assert.equal(calls[0].u, 'https://portal.example/portal/pair/handoff'); assert.deepEqual(Object.keys(calls[0].b).sort(), ['number', 'sid']);
  assert.equal(fs.readFileSync(path.join(auth, 'creds.json'), 'utf8'), '{"a":1}'); assert.equal(loadSaved(data), 'S-ABC234');
  assert.equal((await claimSession({ eco: e, authDir: auth, dataDir: data, fetchFn: f })).why, 'already_logged_in'); // never overwrites a live login
  const evil = (u, o) => Promise.resolve(ok({ blob: JSON.stringify({ v: 1, files: { 'creds.json': 'eA==', '../x': 'eA==' } }) }));
  const a2 = path.join(tmp(), 'a2'); assert.equal((await claimSession({ eco: e, authDir: a2, dataDir: data, fetchFn: evil })).why, 'bad_session'); assert.ok(!fs.existsSync(path.join(path.dirname(a2), 'x')));
  assert.equal((await claimSession({ eco: { ...e, autoPair: false }, authDir: path.join(tmp(), 'a3'), dataDir: data, fetchFn: f })).why, 'not_configured');
  assert.equal((await claimSession({ eco: e, authDir: path.join(tmp(), 'a4'), dataDir: data, fetchFn: () => Promise.resolve({ ok: false, json: async () => ({ success: false, error: { code: 'no_session' } }) }) })).why, 'no_session');
  assert.equal((await claimSession({ eco: e, authDir: path.join(tmp(), 'a5'), dataDir: data, fetchFn: () => Promise.reject(new Error('x')) })).why, 'unreachable');
});
