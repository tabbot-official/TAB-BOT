// Owner shell: full-access server control for the VERIFIED owner only, via DM.
// - Strict gate: owner number + direct DM + not a forwarded message. No groups.
// - Destructive commands are staged and need a literal one-word YES within 5 min.
//   Before anything destructive runs, targets are tarred into data/ops-backup-*.
// - Secrets are never printed: output is redacted, and reading .env/auth or env
//   dumps is refused.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Owner-action audit trail: every shell command, send, staged action lands here (unmasked, owner-only file).
export function audit(line) {
  try {
    fs.mkdirSync('data', { recursive: true });
    fs.appendFileSync(path.join('data', 'agent-audit.log'), new Date().toISOString() + ' ' + String(line).replace(/[\r\n]+/g, ' ').slice(0, 500) + '\n');
  } catch { /* best effort */ }
}

const num = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

import { AsyncLocalStorage } from 'node:async_hooks';
export const actorStore = new AsyncLocalStorage();
/** Who is acting: 'owner' or the operator's number (set only by the message handler from a verified identity). */
export const actorOf = (ctx) => (ctx && ctx.operator ? 'op:' + ctx.operator : 'owner');
export function isVerifiedOwnerDM(ctx) {
  try {
    if (!ctx.isOwner || ctx.isGroup) return false;
    if (ctx.jid.endsWith('@g.us') || ctx.jid.endsWith('@broadcast') || ctx.jid.endsWith('@newsletter')) return false;
    if (ctx.operator) { if (num(ctx.sender) !== String(ctx.operator)) return false; }
    else if (num(ctx.sender) !== String(config.ownerNumber).replace(/\D/g, '')) return false;
    const m = ctx.msg?.message || {};
    for (const v of Object.values(m)) {
      const ci = v?.contextInfo;
      if (ci?.isForwarded || (ci?.forwardingScore || 0) > 0) return false;
    }
    return true;
  } catch { return false; }
}

const DESTRUCTIVE = /(^|\s|&&|\|\||;)(rm|rmdir|mv|dd|shred|kill|pkill|killall|truncate)(\s|$)|>\s*[^&]|chmod\s+-R|chown\s+-R|npm\s+(uninstall|remove|install|update|i)\b|git\s+(push|reset\s+--hard|clean)|:\s*\(\s*\)\s*\{|\bmkfs\b|\breboot\b|\bshutdown\b|\/api\/client\/servers\/[^\s"']+\/power\b/i;
const SECRET_READ = /(^|\s)(cat|less|more|head|tail|strings|xxd|base64|cp|tar|grep|awk|sed|source|\.)\s+[^|;]*(\.env\b|\bauth[\/\s]|auth-backup|\.ssh|id_rsa|id_ed25519)|^\s*(env|printenv|export\s+-p)\s*($|;|\|)/i;
const NPM_MUTATION = /(?:^|\s|&&|\|\||;)npm\s+(install|i|uninstall|remove|rm|update|up|ci|prune|dedupe)\b/i;
const REFUSE = /(wifite|aircrack|metasploit|hydra|nmap\s+.*-p|sqlmap|ddos|\bflood|\bspam)/i;

export function classify(cmd) {
  if (SECRET_READ.test(cmd)) return 'secret';
  if (REFUSE.test(cmd)) return 'refused';
  if (DESTRUCTIVE.test(cmd)) return 'destructive';
  return 'safe';
}

const REDACT = /([A-Za-z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|SALT|CREDENTIAL)[A-Za-z0-9_]*\s*[=:]\s*)\S+/gi;
// Values of secret-named env vars (PANEL_API_KEY, GROQ_API_KEY, ...) are masked wherever they appear in output.
function secretValues(env = process.env) {
  const out = [];
  for (const [k, v] of Object.entries(env)) if (/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|SALT|CREDENTIAL)/i.test(k) && typeof v === 'string' && v.trim().length >= 8) out.push(v.trim());
  return out.sort((a, b) => b.length - a.length);
}
export function redact(text) {
  let t = String(text ?? '');
  for (const v of secretValues()) if (t.includes(v)) t = t.split(v).join('[hidden]');
  t = t.replace(REDACT, '$1[hidden]');
  // long token-shaped blobs (32+ chars of token alphabet) are masked too
  t = t.replace(/\b[A-Za-z0-9_\-+/]{40,}={0,2}\b/g, (m) => m.length >= 40 ? '[hidden]' : m);
  return t.slice(0, 3500);
}

// The command runs in its own process group (spawn detached) so a timeout or a stop kills the whole tree; a plain
// exec timeout only killed /bin/sh and left e.g. "sleep 40" or a download running as an orphan. Output is capped at 1 MB.
const MAX_OUT = 1024 * 1024;
export function execShell(cmd, { timeoutMs = 60000, signal } = {}) {
  return new Promise((resolve) => {
    let killedBy = '', out = '', err = '', size = 0, done = false;
    const win = process.platform === 'win32';
    const child = spawn(win ? 'cmd.exe' : '/bin/sh', win ? ['/d', '/s', '/c', cmd] : ['-c', cmd], { cwd: process.cwd(), detached: !win, env: { ...process.env, TERM: 'dumb' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (which) => (chunk) => {
      if (size >= MAX_OUT) return;
      const s = chunk.toString('utf8').slice(0, MAX_OUT - size); size += s.length;
      if (which === 'out') out += s; else err += s;
      if (size >= MAX_OUT) killTree('output over 1 MB');
    };
    child.stdout.on('data', take('out'));
    child.stderr.on('data', take('err'));
    const killTree = (why) => {
      if (killedBy || done) return; killedBy = why;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
    };
    const timer = setTimeout(() => killTree('timed out after ' + Math.round(timeoutMs / 1000) + ' s'), timeoutMs);
    const onAbort = () => killTree('stopped');
    if (signal?.aborted) onAbort(); else signal?.addEventListener?.('abort', onAbort, { once: true });
    const finish = (code) => {
      if (done) return; done = true;
      clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort);
      const note = killedBy ? '\n[' + killedBy + ']' : '';
      resolve({ code: killedBy === 'stopped' ? 130 : killedBy && killedBy.startsWith('timed out') ? 124 : killedBy ? 1 : (code ?? 1), out: redact(out + (err ? '\n' + err : '') + note) });
    };
    child.on('error', (e) => { err += String(e?.message || e); finish(127); });
    child.on('close', (code) => finish(code));
  });
}

// Staging + confirmation
let pending = null; // {id, cmds, createdAt}
export function stage(cmds, extra = {}) {
  // Carry the full pending payload (kind + its data: install, template, msgjob,
  // apicmd, restorecmd, restore, repaircmd) - the confirm handlers need it.
  pending = { id: crypto.randomBytes(3).toString('hex'), cmds, restarts: 0, note: null, kind: null, ...extra, by: actorStore.getStore()?.actor || 'owner', createdAt: Date.now() };
  return pending;
}
export const getPending = () => (pending && Date.now() - pending.createdAt < 5 * 60e3 ? pending : null);
export const clearPending = () => { pending = null; };

// Back up every existing file/dir a destructive command touches, then run.
// Collect every existing-file target the staged commands would touch. npm-mutating
// commands also change package.json + package-lock.json, so those are backed up too.
function collectTargets(cmds) {
  const targets = new Set();
  for (const c of cmds) {
    if (typeof c !== 'string') continue;
    for (const m of c.matchAll(/(?:rm|mv|cp|truncate|shred)\s+(?:-[a-zA-Z]+\s+)*([^\s;&|]+)/gi)) targets.add(m[1]);
    for (const m of c.matchAll(/>\s*([^\s;&|]+)/g)) targets.add(m[1]);
    if (NPM_MUTATION.test(c)) { targets.add('package.json'); targets.add('package-lock.json'); }
  }
  return targets;
}

const exists = (t) => { try { fs.lstatSync(path.resolve(t)); return true; } catch { return false; } };

// True when staged commands touch at least one existing file: a backup MUST succeed before running.
export function backupRequired(cmds) {
  return [...collectTargets(cmds)].some(exists);
}

export async function backupTargets(cmds) {
  const existing = [...collectTargets(cmds)].filter(exists);
  if (!existing.length) return null;
  const rel = path.join('data', 'ops-backup-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.tar.gz');
  try {
    await execShell(`mkdir -p data`);
    const { code } = await execShell(`tar czf ${JSON.stringify(rel)} -- ${existing.map((t) => JSON.stringify(t)).join(' ')}`);
    if (code !== 0) return null;
    // Confirm the backup actually landed: archive must exist and be non-empty.
    try { if (!fs.statSync(rel).size) return null; } catch { return null; }
    return rel;
  } catch { return null; }
}

// Back up package.json + package-lock.json before a direct npm mutation (install flow).
// Returns the backup dir, or null when the backup could not be completed and verified.
export async function backupManifests() {
  try {
    const have = ['package.json', 'package-lock.json'].filter(exists);
    if (!have.length) return null;
    const rel = path.join('data', 'ops-backup-pkg-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
    const r = await execShell('mkdir -p ' + JSON.stringify(rel) + ' && cp ' + have.map((f) => JSON.stringify(f)).join(' ') + ' ' + JSON.stringify(rel) + '/', { timeoutMs: 30000 });
    if (r.code !== 0) return null;
    const ok = have.every((f) => { try { return fs.statSync(path.join(rel, f)).size > 0; } catch { return false; } });
    return ok ? rel : null;
  } catch { return null; }
}

// Count and size the existing files a destructive command set would touch (for plain-language confirms).
export function describeTargets(cmds) {
  const targets = collectTargets(cmds);
  let count = 0, bytes = 0;
  for (const t of targets) {
    try {
      const st = fs.lstatSync(path.resolve(t));
      count++;
      if (!st.isDirectory()) bytes += st.size;
    } catch { /* gone already */ }
  }
  return { count, bytes, targets: [...targets] };
}

export async function runStaged(p) {
  const cmds = p.cmds || [];
  // Backup-first invariant: if anything existing would be touched and the backup
  // cannot be created and verified, abort instead of running unprotected.
  if (backupRequired(cmds)) {
    const backup = await backupTargets(cmds);
    if (!backup) {
      audit('STAGED ABORTED: safety backup failed, nothing ran');
      return { backup: null, backupFailed: true, results: [] };
    }
    const results = [];
    for (const c of cmds) {
      const r = await execShell(c);
      results.push({ cmd: c, ...r });
      logger.info('[ownershell] ran staged: ' + c.slice(0, 80) + ' -> ' + r.code);
    }
    return { backup, backupFailed: false, results };
  }
  const results = [];
  for (const c of cmds) {
    const r = await execShell(c);
    results.push({ cmd: c, ...r });
    logger.info('[ownershell] ran staged: ' + c.slice(0, 80) + ' -> ' + r.code);
  }
  return { backup: null, backupFailed: false, results };
}
