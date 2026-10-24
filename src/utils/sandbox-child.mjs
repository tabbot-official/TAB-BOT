// Sandbox child runner (item 8). Runs ONE piece of agent-generated code in a
// locked-down Node process started by src/utils/sandbox.js:
//   node --permission (fs read: temp dir + node_modules + this file; fs write:
//   temp dir only; no child_process, worker, addons, wasi, inspector),
//   --max-old-space-size, CPU-time rlimit, wall-clock kill of the process group.
// Node's permission model does not cover sockets before Node 25, so this file
// removes every network entry point (net/tls/http/https/http2/dgram/dns/fetch/
// WebSocket) BEFORE the untrusted module is imported. The only way out is the
// parent's guarded https fetch, and only when the parent enabled it.
// Protocol: parent -> child on stdin (newline JSON), child -> parent on fd 3.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import os from 'node:os';
import * as nodeModule from 'node:module';
import { pathToFileURL } from 'node:url';

const MAX_LINE = 64 * 1024;
const out = new net.Socket({ fd: 3, readable: false, writable: true });
const send = (obj) => { const s = JSON.stringify(obj); if (s.length < MAX_LINE) out.write(s + '\n'); };
const stdin = process.stdin;

// ---- lock down: network, signals to other processes ----
const denied = (what) => function denied() {
  const e = new Error('Network access is disabled in the sandbox (' + what + ')');
  e.code = 'ERR_SANDBOX_NET';
  throw e;
};
const lock = (obj, key, value) => {
  try { Object.defineProperty(obj, key, { value, writable: false, configurable: false, enumerable: true }); } catch { try { obj[key] = value; } catch { /* ignore */ } }
};
for (const k of ['connect', 'createConnection', 'createServer']) lock(net, k, denied('net.' + k));
lock(net.Socket.prototype, 'connect', denied('net.Socket.connect'));
lock(net.Server.prototype, 'listen', denied('net.Server.listen'));
for (const k of ['connect', 'createServer']) lock(tls, k, denied('tls.' + k));
for (const k of ['request', 'get', 'createServer']) { lock(http, k, denied('http.' + k)); lock(https, k, denied('https.' + k)); }
for (const k of ['connect', 'createServer', 'createSecureServer']) lock(http2, k, denied('http2.' + k));
lock(dgram, 'createSocket', denied('dgram.createSocket'));
for (const k of ['bind', 'send', 'connect']) lock(dgram.Socket.prototype, k, denied('dgram.' + k));
for (const k of Object.keys(dns)) if (typeof dns[k] === 'function' && /^(lookup|lookupService|resolve)/.test(k)) lock(dns, k, denied('dns.' + k));
for (const k of Object.keys(dnsPromises)) if (typeof dnsPromises[k] === 'function' && /^(lookup|lookupService|resolve)/.test(k)) lock(dnsPromises, k, denied('dns.' + k));
for (const R of [dns.Resolver, dnsPromises.Resolver]) for (const k of Object.getOwnPropertyNames(R.prototype)) if (/^(resolve|reverse)/.test(k)) lock(R.prototype, k, denied('dns.Resolver.' + k));
lock(http, 'Agent', function Agent() { denied('http.Agent')(); });
for (const g of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest']) { try { delete globalThis[g]; } catch { /* ignore */ } }
for (const g of ['WebSocket', 'EventSource', 'XMLHttpRequest']) lock(globalThis, g, undefined);
// fetch is the parent's guarded fetch when the parent enabled it, else a denial
lock(globalThis, 'fetch', (...a) => (init && init.net ? sandboxFetch(...a) : Promise.reject(Object.assign(new Error('Network access is disabled in the sandbox (fetch)'), { code: 'ERR_SANDBOX_NET' }))));
const selfPid = process.pid;
const realKill = process.kill.bind(process);
lock(process, 'kill', (pid, sig) => { if (Number(pid) !== selfPid) { const e = new Error('Signals to other processes are blocked in the sandbox'); e.code = 'ERR_SANDBOX_KILL'; throw e; } return realKill(pid, sig); });
lock(process, '_kill', undefined);
lock(os, 'setPriority', () => { throw new Error('setPriority is blocked in the sandbox'); });
// Disk budget for the temp dir: count bytes written through the fs write
// APIs (the parent also polls the dir size and RLIMIT_FSIZE caps each file).
const DISK_CAP = Math.max(1, Number(process.env.SANDBOX_DISK_BYTES) || 32 * 1048576);
let written = 0;
const sizeOf = (d) => (typeof d === 'string' ? Buffer.byteLength(d) : d && typeof d.byteLength === 'number' ? d.byteLength : Array.isArray(d) ? d.reduce((n, x) => n + sizeOf(x), 0) : 0);
const charge = (n) => {
  written += n;
  if (written > DISK_CAP) { const e = new Error('Disk budget exceeded in the sandbox'); e.code = 'ERR_SANDBOX_DISK'; throw e; }
};
const meter = (obj, key, argIndex) => {
  const orig = obj && obj[key];
  if (typeof orig !== 'function') return;
  lock(obj, key, function metered(...args) { charge(sizeOf(args[argIndex])); return orig.apply(this, args); });
};
for (const [k, i] of [['writeSync', 1], ['write', 1], ['writeFileSync', 1], ['writeFile', 1], ['appendFileSync', 1], ['appendFile', 1], ['writevSync', 1], ['writev', 1]]) meter(fs, k, i);
for (const [k, i] of [['writeFile', 1], ['appendFile', 1]]) meter(fs.promises, k, i);
try {
  const probe = path.join(process.cwd(), '.fh');
  const fh = await fs.promises.open(probe, 'w');
  const proto = Object.getPrototypeOf(fh);
  await fh.close(); fs.unlinkSync(probe);
  for (const [k, i] of [['write', 0], ['writeFile', 0], ['appendFile', 0], ['writev', 0]]) meter(proto, k, i);
} catch { /* FileHandle writes stay covered by the parent's size watch */ }
nodeModule.syncBuiltinESMExports();

// ---- request/response bridge to the parent ----
let seq = 0;
const pending = new Map();
function call(op, payload) {
  const id = ++seq;
  return new Promise((ok, no) => { pending.set(id, { ok, no }); send({ op, id, ...payload }); });
}
let buf = '';
let init = null;
let gotInit;
const initP = new Promise((r) => { gotInit = r; });
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buf += chunk;
  if (buf.length > 4 * MAX_LINE) process.exit(70);
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (!init) { init = m; gotInit(m); continue; }
    const p = pending.get(m.id); if (!p) continue;
    pending.delete(m.id);
    m.ok ? p.ok(m.value) : p.no(new Error(String(m.error || 'failed')));
  }
});
stdin.on('end', () => process.exit(0));

const work = process.cwd();
let fileNo = 0;
function stash(data) {
  const name = 'out-' + (++fileNo) + '.bin';
  fs.writeFileSync(path.join(work, name), data);
  return { __file: name };
}
function take(file) {
  const p = path.join(work, path.basename(String(file)));
  const b = fs.readFileSync(p); try { fs.unlinkSync(p); } catch { /* ignore */ }
  return b;
}
const isBytes = (v) => v instanceof Uint8Array || v instanceof ArrayBuffer;
function packContent(content) {
  if (!content || typeof content !== 'object') throw new Error('sendMessage content must be an object');
  const o = {};
  for (const [k, v] of Object.entries(content)) {
    if (isBytes(v)) o[k] = stash(Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
    else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string') o[k] = { url: String(v.url) };
    else if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) o[k] = v;
    else throw new Error('sendMessage field "' + k + '" is not supported in the sandbox');
  }
  return o;
}
async function guardedFetch(url, opts = {}) {
  if (!init.net) { const e = new Error('Network access is disabled in the sandbox'); e.code = 'ERR_SANDBOX_NET'; throw e; }
  const method = String(opts.method || 'GET').toUpperCase();
  let body = opts.body;
  if (body != null && typeof body !== 'string') { if (isBytes(body)) body = Buffer.from(body).toString('utf8'); else body = String(body); }
  const headers = {};
  const h = opts.headers;
  if (h && typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => { headers[k] = String(v); });
  else if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) headers[k] = String(v);
  const r = await call('fetch', { url: String(url && url.href ? url.href : url), method, headers, body: body == null ? null : body.slice(0, 32768), maxBytes: Number(opts.maxBytes) || 0, timeoutMs: Number(opts.timeoutMs) || 0 });
  return { status: r.status, headers: r.headers || {}, finalUrl: r.finalUrl, body: take(r.file) };
}
async function sandboxFetch(input, opts = {}) {
  const url = typeof input === 'string' ? input : (input && (input.url || input.href)) || String(input);
  const r = await guardedFetch(url, opts);
  const res = new Response(r.status === 204 || r.status === 304 ? null : r.body, { status: r.status, headers: Object.entries(r.headers).filter(([, v]) => typeof v === 'string') });
  Object.defineProperty(res, 'url', { value: r.finalUrl || url });
  return res;
}

async function main() {
  await initP;
  // Bare package imports in the generated module resolve from the bot's
  // node_modules (read-only) instead of the temp dir. No symlink is used:
  // a symlink inside the temp dir would let "node_modules/../" escape.
  const cmdUrl = pathToFileURL(path.join(work, init.file)).href;
  if (init.modulesRoot && typeof nodeModule.registerHooks === 'function') {
    const base = pathToFileURL(path.join(init.modulesRoot, 'index.js')).href;
    nodeModule.registerHooks({
      resolve(specifier, context, nextResolve) {
        const bare = !/^(node:|data:|file:|\.|\/)/.test(specifier) && !nodeModule.isBuiltin(specifier);
        if (bare && context.parentURL === cmdUrl) return nextResolve(specifier, { ...context, parentURL: base });
        return nextResolve(specifier, context);
      },
    });
  }
  const c = init.ctx || {};
  const ctx = {
    args: Array.isArray(c.args) ? c.args.map(String) : [],
    jid: String(c.jid || ''),
    sender: String(c.sender || ''),
    commandName: String(c.commandName || ''),
    prefix: String(c.prefix || '/'),
    isGroup: !!c.isGroup,
    msg: { pushName: String(c.pushName || ''), key: { remoteJid: String(c.jid || '') } },
    reply: (text) => call('reply', { text: String(text) }),
    react: (emoji) => call('react', { emoji: String(emoji) }),
    fetchPublic: guardedFetch,
    sock: {
      sendMessage: (jid, content, opts) => call('send', { jid: String(jid), content: packContent(content), quoted: !!(opts && opts.quoted) }),
    },
  };
  const mod = await import(cmdUrl);
  await mod.default(ctx);
}
const fail = (e) => {
  send({ op: 'done', ok: false, error: String((e && (e.code ? e.code + ': ' : '') + e.message) || e).slice(0, 300) });
  out.end(() => process.exit(0));
};
process.on('uncaughtException', fail);
process.on('unhandledRejection', () => { /* a stray rejected promise does not fail the command (the bot behaves the same) */ });
main().then(() => { send({ op: 'done', ok: true }); out.end(() => process.exit(0)); }, fail);
