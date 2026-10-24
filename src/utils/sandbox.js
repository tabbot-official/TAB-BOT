// Sandbox for agent-generated code (item 8).
// Every AI-written command body (and the export probe of freshly installed npm
// packages) runs in a SEPARATE Node process, never inside the bot:
//   - node --permission: fs read limited to a fresh temp dir, node_modules and
//     the child runner; fs write limited to the temp dir; no child_process,
//     no worker threads, no native addons, no WASI, no inspector
//   - no network: every socket/DNS/fetch entry point is removed in the child
//     (Node 22/24's permission model does not cover sockets; Node 25+ also gets
//     the native --allow-net denial). The optional exception is the parent's
//     guarded public https fetch (fetchPublic: public IPs only, redirects
//     re-checked, size-capped), enabled per run.
//   - minimal environment (no tokens, no .env values), cwd = temp dir
//   - --max-old-space-size heap cap + RLIMIT_DATA + an RSS watcher
//   - CPU-time rlimit (SIGXCPU) + a wall-clock timer that SIGKILLs the whole
//     process group; temp dir size/file-count capped; temp dir always removed
//   - at most SANDBOX_MAX_CONCURRENT runs at once (default 1, 308 MB box)
// The owner's explicit shell (ownershell.js) is NOT routed through here.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(HERE, 'sandbox-child.mjs');
const ROOT = path.resolve(HERE, '..', '..');
export const NODE_MODULES = path.join(ROOT, 'node_modules');
const MAX_LINE = 64 * 1024;

const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export function sandboxLimits(env = process.env) {
  return {
    wallMs: int(env.SANDBOX_WALL_MS, 30000, 1000, 300000),
    cpuSeconds: int(env.SANDBOX_CPU_SECONDS, 10, 1, 120),
    heapMb: int(env.SANDBOX_HEAP_MB, 48, 16, 256),
    rssMb: int(env.SANDBOX_RSS_MB, 96, 48, 512), // child is ~60 MB typical; bot ~210 MB + 96 stays under the 308 MB box
    dataMb: int(env.SANDBOX_DATA_MB, 0, 0, 4096), // 0 = auto: Node's own startup VmData + heap + 128 MB
    diskMb: int(env.SANDBOX_DISK_MB, 32, 1, 512),
    maxFiles: int(env.SANDBOX_MAX_FILES, 200, 10, 10000),
    maxReplies: int(env.SANDBOX_MAX_REPLIES, 10, 1, 100),
    maxFetches: int(env.SANDBOX_MAX_FETCHES, 10, 0, 100),
    maxMediaMb: int(env.SANDBOX_MAX_MEDIA_MB, 16, 1, 64),
    concurrent: int(env.SANDBOX_MAX_CONCURRENT, 1, 1, 8),
    queue: int(env.SANDBOX_MAX_QUEUE, 8, 0, 100),
  };
}

// RLIMIT_DATA counts writable private memory, so it also stops off-heap
// (Buffer/ArrayBuffer) bombs that --max-old-space-size does not see. Node's
// own baseline differs a lot by version (v22 ~50 MB, v24 ~575 MB of mostly
// untouched reservations), so it is measured once on this Node binary.
let baseDataKb;
export async function nodeBaseDataKb(heapMb = 48) {
  if (baseDataKb !== undefined) return baseDataKb;
  baseDataKb = await new Promise((resolve) => {
    execFile(process.execPath, ['--max-old-space-size=' + heapMb, '--max-semi-space-size=2', '-e',
      "const m=/VmData:\\s+(\\d+)/.exec(require('fs').readFileSync('/proc/self/status','utf8'));process.stdout.write(m?m[1]:'0')"],
    { timeout: 10000, killSignal: 'SIGKILL', env: { PATH: '/usr/bin:/bin' }, maxBuffer: 1024 }, (err, out) => {
      const n = parseInt(String(out || ''), 10);
      resolve(!err && n > 0 ? n : 0);
    });
  });
  return baseDataKb;
}
export async function dataLimitKb(lim) {
  if (lim.dataMb) return lim.dataMb * 1024;
  const base = await nodeBaseDataKb(lim.heapMb);
  return base ? base + (lim.heapMb + 128) * 1024 : 0; // 0 = no data rlimit (RSS watcher still applies)
}

// ---- concurrency gate ----
let running = 0;
const waiters = [];
async function acquire(lim) {
  if (running < lim.concurrent) { running++; return; }
  if (waiters.length >= lim.queue) { const e = new Error('The sandbox is busy, try again in a moment'); e.code = 'SANDBOX_BUSY'; throw e; }
  await new Promise((r) => waiters.push(r));
}
function release() { const next = waiters.shift(); if (next) next(); else running = Math.max(0, running - 1); }
export function sandboxStats() { return { running, queued: waiters.length }; }

// node_modules is granted read-only so generated code can import installed
// packages - but only if no symlink in it points OUTSIDE node_modules (the
// permission model checks paths lexically, so such a link would be an escape).
let modulesOk = null;
export function modulesReadable(dir = NODE_MODULES) {
  if (modulesOk != null && dir === NODE_MODULES) return modulesOk;
  let ok = true;
  const real = (() => { try { return fs.realpathSync(dir); } catch { return null; } })();
  if (!real) ok = false;
  else {
    const check = (d, depth) => {
      let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isSymbolicLink()) {
          let t = null; try { t = fs.realpathSync(p); } catch { continue; }
          if (t !== real && !t.startsWith(real + path.sep)) { ok = false; return; }
        } else if (e.isDirectory() && depth < 1 && (e.name.startsWith('@') || e.name === '.bin')) check(p, depth + 1);
        if (!ok) return;
      }
    };
    check(real, 0);
  }
  if (dir === NODE_MODULES) modulesOk = ok;
  return ok;
}

export function childArgs({ work, heapMb, modules = modulesReadable() }) {
  const a = [
    '--permission',
    '--allow-fs-read=' + work,
    '--allow-fs-read=' + CHILD,
  ];
  if (modules) {
    a.push('--allow-fs-read=' + NODE_MODULES, '--allow-fs-read=' + path.join(ROOT, 'package.json'));
    let real = NODE_MODULES; try { real = fs.realpathSync(NODE_MODULES); } catch { /* keep */ }
    if (real !== NODE_MODULES) a.push('--allow-fs-read=' + real);
  }
  a.push(
    '--allow-fs-write=' + work,
    '--max-old-space-size=' + heapMb,
    '--max-semi-space-size=2',
    '--stack-size=900',
    '--disallow-code-generation-from-strings',
    '--no-addons',
    '--no-warnings',
    '--no-deprecation',
  );
  return a.concat(CHILD);
}

function dirUsage(dir, cap) {
  let bytes = 0, files = 0;
  const walk = (d, depth) => {
    if (depth > 8 || files > cap) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      files++;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile()) { try { bytes += fs.statSync(p).size; } catch { /* gone */ } }
    }
  };
  walk(dir, 0);
  return { bytes, files };
}

function readRssMb(pid) {
  try {
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
    return m ? Number(m[1]) / 1024 : 0;
  } catch { return 0; }
}

/**
 * Run `source` (an ES module whose default export is `async (ctx) => {}`) in
 * the sandbox. `handlers` serve the child's requests:
 *   reply(text), send(jid, content, {quoted}), react(emoji),
 *   fetch(url, {method, headers, body, maxBytes, timeoutMs}) -> {status, headers, body: Buffer, finalUrl}
 * Returns { ok, error?, killed?: 'timeout'|'cpu'|'limit'|'memory'|'disk'|'protocol', code, signal, ms, stderr }.
 */
export async function runSandboxed(source, { ctx = {}, net = false, handlers = {}, limits = {}, spawnImpl = spawn } = {}) {
  const lim = { ...sandboxLimits(), ...limits };
  await acquire(lim);
  const t0 = Date.now();
  let work = null, child = null;
  try {
    work = await fsp.mkdtemp(path.join(os.tmpdir(), 'tab-sbx-'));
    await fsp.writeFile(path.join(work, 'cmd.mjs'), String(source));
    const dataKb = await dataLimitKb(lim);
    const nodeArgs = childArgs({ work, heapMb: lim.heapMb });
    // exec through sh so the rlimits apply to node itself (same pid, own group)
    const script = 'ulimit -t ' + lim.cpuSeconds + ' 2>/dev/null; ' + (dataKb ? 'ulimit -d ' + dataKb + ' 2>/dev/null; ' : '') + 'ulimit -f ' + (lim.maxMediaMb * 2048) + ' 2>/dev/null; ulimit -c 0 2>/dev/null; exec "$@"';
    const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: work, TMPDIR: work, LANG: 'C.UTF-8', NODE_ENV: 'production', NODE_OPTIONS: '', SANDBOX_DISK_BYTES: String(lim.diskMb * 1048576) };
    child = spawnImpl('/bin/sh', ['-c', script, 'sandbox', process.execPath, ...nodeArgs], {
      cwd: work, env, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    return await supervise(child, { work, lim, ctx, net, handlers, t0 });
  } finally {
    if (child && child.pid && child.exitCode == null && child.signalCode == null) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
    if (work) { try { await fsp.rm(work, { recursive: true, force: true }); } catch { /* best effort */ } }
    release();
  }
}

function supervise(child, { work, lim, ctx, net, handlers, t0 }) {
  return new Promise((resolve) => {
    let killed = null, done = null, settled = false, stderr = '', replies = 0, fetches = 0, sends = 0;
    const killGroup = (why) => {
      if (!killed) killed = why;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
    };
    const wall = setTimeout(() => killGroup('timeout'), lim.wallMs);
    const watch = setInterval(() => {
      if (readRssMb(child.pid) > lim.rssMb) return killGroup('memory');
      const u = dirUsage(work, lim.maxFiles);
      if (u.bytes > lim.diskMb * 1048576 || u.files > lim.maxFiles) killGroup('disk');
    }, 100);
    const finish = (code, signal) => {
      if (settled) return; settled = true;
      clearTimeout(wall); clearInterval(watch);
      if (!killed) {
        // we did not kill it: SIGXCPU / SIGKILL here come from the CPU rlimit
        if (signal === 'SIGXCPU') killed = 'cpu';
        else if (signal === 'SIGKILL' && !done) killed = 'limit';
        if (!done && /heap limit|Allocation failed|out of memory|Cannot allocate memory/i.test(stderr)) killed = 'memory';
      }
      const ok = !!(done && done.ok && !killed);
      const error = killed ? killedText(killed, lim) : done ? (done.ok ? undefined : done.error) : ('the sandboxed code exited without finishing' + (signal ? ' (' + signal + ')' : code ? ' (exit ' + code + ')' : '') + (stderr ? ': ' + lastLine(stderr) : ''));
      resolve({ ok, error, killed: killed || undefined, code, signal, ms: Date.now() - t0, stderr: stderr.slice(-2000) });
    };
    child.on('error', (e) => { stderr += String(e && e.message); finish(null, null); });
    child.on('close', finish);
    const keep = (d) => { stderr = (stderr + d).slice(-4000); };
    child.stderr.setEncoding('utf8'); child.stderr.on('data', keep);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', () => { /* user console output is discarded */ });
    child.stdin.on('error', () => {});
    const write = (o) => { try { child.stdin.write(JSON.stringify(o) + '\n'); } catch { /* child gone */ } };
    write({ ctx: publicCtx(ctx), net: !!net, file: 'cmd.mjs', modulesRoot: modulesReadable() ? ROOT : null });
    const answer = (id, p) => p.then((value) => write({ id, ok: true, value }), (e) => write({ id, ok: false, error: String(e && e.message || e).slice(0, 300) }));
    let buf = '';
    const chan = child.stdio[3];
    chan.setEncoding('utf8');
    chan.on('error', () => {});
    chan.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > MAX_LINE * 2) { killGroup('protocol'); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { killGroup('protocol'); return; }
        if (!m || typeof m !== 'object') continue;
        if (m.op === 'done') { done = { ok: !!m.ok, error: m.ok ? undefined : String(m.error || 'failed').slice(0, 300) }; continue; }
        const id = Number(m.id);
        if (m.op === 'reply') {
          if (++replies > lim.maxReplies) { answer(id, Promise.reject(new Error('too many replies from one command'))); continue; }
          answer(id, Promise.resolve(handlers.reply ? handlers.reply(String(m.text || '').slice(0, 4000)) : null).then(() => true));
        } else if (m.op === 'react') {
          answer(id, Promise.resolve(handlers.react ? handlers.react(String(m.emoji || '').slice(0, 8)) : null).then(() => true));
        } else if (m.op === 'send') {
          if (++sends > lim.maxReplies) { answer(id, Promise.reject(new Error('too many messages from one command'))); continue; }
          answer(id, (async () => {
            if (String(m.jid) !== String(ctx.jid)) throw new Error('commands may only send to the chat they were used in');
            const content = await unpackContent(m.content, { work, lim, net, handlers, countFetch: () => { if (++fetches > lim.maxFetches) throw new Error('too many network requests from one command'); } });
            if (!handlers.send) return true;
            await handlers.send(String(ctx.jid), content, { quoted: !!m.quoted });
            return true;
          })());
        } else if (m.op === 'fetch') {
          answer(id, (async () => {
            if (!net || !handlers.fetch) { const e = new Error('Network access is disabled in the sandbox'); throw e; }
            if (++fetches > lim.maxFetches) throw new Error('too many network requests from one command');
            const url = String(m.url || '');
            if (!/^https:\/\//i.test(url)) throw new Error('only https:// URLs are allowed from the sandbox');
            const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(String(m.method)) ? String(m.method) : 'GET';
            const maxBytes = Math.min(Number(m.maxBytes) || 2 * 1048576, 5 * 1048576);
            const timeoutMs = Math.min(Number(m.timeoutMs) || 20000, Math.max(1000, lim.wallMs - (Date.now() - t0)));
            const headers = {};
            for (const [k, v] of Object.entries(m.headers || {}).slice(0, 30)) if (/^[a-z0-9-]{1,64}$/i.test(k) && !/^(host|cookie|authorization-proxy|proxy-)/i.test(k)) headers[k] = String(v).slice(0, 2000);
            const r = await handlers.fetch(url, { method, headers, body: m.body == null ? undefined : String(m.body).slice(0, 32768), maxBytes, timeoutMs });
            const file = 'in-' + id + '.bin';
            await fsp.writeFile(path.join(work, file), r.body || Buffer.alloc(0));
            const hdrs = {};
            for (const [k, v] of Object.entries(r.headers || {}).slice(0, 40)) if (typeof v === 'string' && !/^set-cookie$/i.test(k)) hdrs[k] = v.slice(0, 1000);
            return { status: r.status, headers: hdrs, finalUrl: String(r.finalUrl || url).slice(0, 2000), file };
          })());
        }
      }
    });
  });
}

const MEDIA_KEYS = ['image', 'video', 'audio', 'document', 'sticker'];
const PLAIN_KEYS = ['text', 'caption', 'mimetype', 'fileName', 'ptt', 'gifPlayback', 'viewOnce'];
async function unpackContent(content, { work, lim, net, handlers, countFetch }) {
  if (!content || typeof content !== 'object') throw new Error('bad message content');
  const out = {};
  let total = 0;
  for (const [k, v] of Object.entries(content)) {
    if (PLAIN_KEYS.includes(k)) {
      if (v == null) continue;
      if (!['string', 'number', 'boolean'].includes(typeof v)) throw new Error('field ' + k + ' must be plain');
      out[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
      continue;
    }
    if (!MEDIA_KEYS.includes(k)) throw new Error('message field "' + String(k).slice(0, 20) + '" is not allowed from the sandbox');
    let b;
    if (v && typeof v === 'object' && typeof v.__file === 'string') {
      const p = path.join(work, path.basename(v.__file));
      const st = await fsp.lstat(p);
      if (!st.isFile()) throw new Error('media file missing');
      if (st.size > lim.maxMediaMb * 1048576) throw new Error('media is too large');
      b = await fsp.readFile(p);
    } else if (v && typeof v === 'object' && typeof v.url === 'string') {
      if (!net || !handlers.fetch) throw new Error('media URLs need network access, which is disabled for this command');
      if (!/^https:\/\//i.test(v.url)) throw new Error('only https:// media URLs are allowed');
      countFetch();
      const r = await handlers.fetch(v.url, { method: 'GET', headers: {}, maxBytes: lim.maxMediaMb * 1048576, timeoutMs: 30000 });
      if (r.status >= 400) throw new Error('media download failed (HTTP ' + r.status + ')');
      b = r.body;
    } else throw new Error('media field ' + k + ' must be bytes or an https url');
    total += b.length;
    if (total > lim.maxMediaMb * 1048576) throw new Error('media is too large');
    out[k] = b;
  }
  if (!Object.keys(out).length) throw new Error('empty message');
  return out;
}

function publicCtx(ctx) {
  return {
    args: Array.isArray(ctx.args) ? ctx.args.slice(0, 200).map((a) => String(a).slice(0, 2000)) : [],
    jid: String(ctx.jid || ''),
    sender: String(ctx.sender || ''),
    commandName: String(ctx.commandName || ''),
    prefix: String(ctx.prefix || '/'),
    isGroup: String(ctx.jid || '').endsWith('@g.us'),
    pushName: String(ctx.msg?.pushName || '').slice(0, 60),
  };
}
const lastLine = (s) => String(s).trim().split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) || '';
function killedText(k, lim) {
  if (k === 'timeout') return 'it took longer than ' + Math.round(lim.wallMs / 1000) + 's and was stopped';
  if (k === 'cpu') return 'it used more than ' + lim.cpuSeconds + 's of CPU and was stopped';
  if (k === 'memory') return 'it used too much memory and was stopped';
  if (k === 'limit') return 'it hit a CPU or memory limit and was stopped';
  if (k === 'disk') return 'it wrote too much temporary data and was stopped';
  return 'it broke the sandbox protocol and was stopped';
}

/** Wrap a generated command body (the statements inside run(ctx)) as the sandbox module. */
export function bodyModule(body) {
  return 'export default async (ctx) => {\n' + String(body) + '\n};\n';
}

/** True when the body needs the guarded network bridge (fetch / ctx.fetchPublic / an https URL). */
export function bodyWantsNet(body) {
  return /\bfetch(Public)?\s*\(|https:\/\/|\burl\s*:/.test(String(body));
}

/**
 * Run a generated command body for a real chat ctx. Replies and media go back
 * through ctx; network (when the body asks for it) goes through the guarded
 * fetchPublic. Throws on failure so the handler's normal error path applies.
 */
export async function runGeneratedCommand(name, body, ctx, { limits, deps = {} } = {}) {
  const net = bodyWantsNet(body);
  const fetchImpl = deps.fetch || (async (url, o) => {
    const { requestPublic } = await import('../utilities/validation.js');
    const r = await requestPublic(url, { method: o.method, headers: o.headers, body: o.body, timeoutMs: o.timeoutMs });
    if (!r.stream) return { status: r.status, headers: r.headers, body: Buffer.alloc(0), finalUrl: r.finalUrl };
    const bodyBuf = await new Promise((ok, no) => {
      let n = 0; const chunks = [];
      r.stream.on('data', (c) => { n += c.length; if (n > o.maxBytes) { r.stream.destroy(); no(new Error('Response too large')); } else chunks.push(c); });
      r.stream.on('end', () => ok(Buffer.concat(chunks)));
      r.stream.on('error', no);
    });
    return { status: r.status, headers: r.headers, body: bodyBuf, finalUrl: r.finalUrl };
  });
  const res = await runSandboxed(bodyModule(body), {
    ctx, net, limits, spawnImpl: deps.spawnImpl,
    handlers: {
      reply: (t) => ctx.reply(t),
      react: (e) => (ctx.react ? ctx.react(e) : null),
      send: (jid, content, o) => ctx.sock.sendMessage(jid, content, o && o.quoted && ctx.msg ? { quoted: ctx.msg } : undefined),
      fetch: fetchImpl,
    },
  });
  if (!res.ok) {
    const e = new Error('/' + name + ' failed in the sandbox: ' + (res.error || 'unknown error'));
    e.sandbox = res;
    throw e;
  }
  return res;
}
