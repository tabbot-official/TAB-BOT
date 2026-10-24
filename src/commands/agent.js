// Agent Mode: give Tab a goal, it plans a few steps and runs them.
import { fetchPublic } from '../utilities/validation.js';
// - Everyone (SAFE mode): read-only whitelist commands only. Out-of-scope goals
//   get a clear answer, never generic shell dumps.
// - Verified owner DM (shell mode, flag 'ownershell'): full-access shell planner.
//   Safe commands run right away; destructive ones are staged and need a literal
//   one-word YES (or "/agent yes") within 5 min, with an automatic backup first.
//   Secrets are never printed; attacks/privacy violations are refused.
//   Owner replies are short plain English summaries - raw command output is only
//   shown when the owner asks for it ("raw").
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { askAi, chainStatus } from '../ai/providers.js';
import { beginTask, endTask, taskKey, stopTasks, withTimeout, mutedCtx, runSteps, renderPlan, progressEditor, fmtSecs, TaskCancelled, StepTimeout } from '../agent/runner.js';
import { TOOLS, parseToolStep, takeTool, toolLimits, runSearch, readUrl } from '../agent/tools.js';
import { panelConfig, getStatus, formatStatus, getConsoleLogs, localLogs, redact as panelRedact, restartBot } from '../utilities/panel.js';
import { registry } from '../handlers/commandHandler.js';
import * as shell from '../utilities/ownershell.js';
import { operatorNumbers } from '../permissions/operators.js';
import { suggest } from '../utils/suggest.js';
import { createProgressMessage } from '../utils/progressBar.js';
import { getSock } from '../utilities/ownersock.js';
import * as agentqueue from '../utilities/agentqueue.js';
import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import { loadGenerated, saveGenerated, noteGenerated, dropGenerated, getGenerated, archiveVersion, listVersions, versionPath, logFailure, readFailures, buildCommandFile } from '../utils/genregistry.js';
import { validateGeneratedSource } from '../utils/genstruct.js';
import { pickTemplate } from '../utils/templates.js';
import { buildKit, unpackKit } from '../utils/recovery.js';
import * as sessions from '../utils/sessions.js';
import os from 'node:os';
import { findMedia } from '../utils/imageTools.js';
import { runEnhance } from './_enhance.js';

const SAFE = ['weather', 'news', 'ask', 'define', 'translate', 'wiki', 'time', 'stock', 'quote', 'lyrics'];

// ---- Quota dashboard (estimates: counts /agent-side LLM calls, not provider-side quotas)
const QUOTA_FILE = path.join('data', 'agent-quota.json');
function quotaBump(field, feature) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    let q = {};
    try { q = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8')); } catch {}
    if (q.day !== day) q = { day, calls: 0, failures: 0, byFeature: {} };
    q[field] = (q[field] || 0) + 1;
    q.byFeature = q.byFeature || {};
    q.byFeature[feature] = (q.byFeature[feature] || 0) + 1;
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(q));
  } catch { /* best effort */ }
}
/** Markdown from the AI -> WhatsApp text: **bold** -> *bold*, no "#" headings. */
export function whatsappText(t) { return String(t || '').replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '').trim(); }
/** Agent panel steps: read-only status/logs run; anything else (stop, kill, start...) becomes a refusal note. */
export function screenPanelStep(step) {
  if (step.action === 'status' || step.action === 'logs') return step;
  return { type: 'note', text: 'Refused: I only read the server panel (status/logs) or restart through it - stopping or killing would take Tab fully offline. Use ' + (config.prefix || '.') + 'panel stop yourself if you really mean it.' };
}
/** The agent may run the .panel command only for reading (status / logs [n] / help). */
export function panelCmdArgsAllowed(args) { return /^\s*((status|info|logs?|console|help)(\s+\d{1,3})?)?\s*$/i.test(String(args || '')); }
/** One line showing the shared AI line-up (never keys): "Groq ✅ → Gemini ❌ no key → ... → Pollinations ✅". */
export function aiLineup(st = chainStatus()) {
  return st.map((p) => p.label.replace(/ \(.*\)$/, '') + (p.ready ? (p.cooling ? ' ⏳ cooling' : ' ✅') : ' ❌ no key')).join(' → ');
}
async function ai(prompt, opts, feature = 'general') {
  quotaBump('calls', feature);
  try { return await askAi(prompt, opts); }
  catch (e) { quotaBump('failures', feature); throw e; }
}
// Shared codegen rules for install/builder/repair (bodies only, no imports).
const CODEGEN_RULES = 'Rules:\n- Output ONLY raw JavaScript statements. No markdown, no code fences, no explanation, no function wrapper, NO export statements, NO import statements.\n- Load packages inside the body with await import().\n- ctx.args is the user\'s words as a string array; await ctx.reply(text) sends a plain reply; ctx.sock and ctx.jid are available for media replies; keep replies short, plain English.\n- NEVER read or print process.env, tokens, keys, .env, files under auth/, or data files like api-keys.json, dashboard-token, install-id, session-state.json. No child_process, no shell, no eval/new Function, no writes outside /tmp and data/. Only https URLs, never local or private addresses. Reply ONLY via ctx.reply or ctx.sock.sendMessage(ctx.jid, ...) - never hardcode a number or chat id.\n- On missing input, reply with the usage line. Wrap risky work in try/catch and on failure reply starting with "Error: " followed by the actual error message (first 150 chars), never a generic "failed" message. Keep it under 30 lines.\n- For multi-turn conversations you may use the sessions helper: const S = await import(\'../utils/sessions.js\'); S.begin(ctx, { cmd: \'name\', ttlMs: 300000, state: {}, onText: async (sctx, text, end) => { /* handle each reply; call end() when done */ } }); sctx has reply, jid, state.';
// Explicit numbered list inside a goal ("1. a 2. b ..." or one per line). WhatsApp args arrive whitespace-collapsed, so
// split on the numbers themselves. Returns {items, clean, markers}: clean=true only when the numbers run 1,2,3... in order
// with nothing left over; markers counts every "N." / "N)" token so gaps or duplicates are reported, never silently merged.
export function extractNumberedList(goal) {
  const text = String(goal || '');
  const re = /(?:^|[\s,;:])(\d{1,6})\s*[.)]\s*/g;
  const all = []; const seq = []; let m, want = 1;
  while ((m = re.exec(text))) { const k = { n: Number(m[1]), at: m.index + m[0].length, start: m.index }; all.push(k); if (k.n === want) { seq.push(k); want++; } }
  const cut = (marks) => marks.map((k, n) => text.slice(k.at, n + 1 < marks.length ? marks[n + 1].start : text.length).replace(/\s+/g, ' ').trim());
  const items = seq.length >= 3 ? cut(seq) : [];
  const clean = items.length >= 3 && items.every(Boolean) && all.length === seq.length;
  return { items: clean ? items : [], clean, markers: all.length };
}
const MAX_BULK = 1000; // items per request; each item is delivered one at a time, durably (queue file survives restarts). Over this: rejected, nothing started.
const MAX_PENDING = 1500; // total pending items across requests, so repeated requests cannot grow the queue file without bound
const MEDIA_INTENT = /\b(download|play|songs?|videos?|gaana|gane|bhej|send|get)\b/i;
const MAX_STEPS = 5, MAX_GOAL = 20000, MAX_ARG = 120, SH_STEPS = 15, SH_EXEC_CAP = 100;

function resolveCmd(name) {
  const direct = registry.get(name);
  if (direct) return { cmd: direct, name };
  const near = suggest(name, registry.list(), 1);
  if (near && near.length) {
    const c = registry.get(near[0]);
    if (c) return { cmd: c, name: near[0] };
  }
  return null;
}

const hits = new Map(); // user -> [timestamps]
function allow(user, perHour, now = Date.now()) {
  const list = (hits.get(user) || []).filter((t) => now - t < 3600e3);
  if (list.length >= perHour) { hits.set(user, list); return false; }
  list.push(now); hits.set(user, list);
  if (hits.size > 2000) hits.clear();
  return true;
}


export function parseShellPlan(raw) {
  const m = String(raw || '').match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    const steps = [];
    for (const s of arr.slice(0, SH_STEPS)) {
      if (s?.refuse) return { refuse: String(s.refuse).slice(0, 300) };
      if (s?.done) return { done: String(s.done).slice(0, 300) };
      if (s?.ask) return { ask: String(s.ask).slice(0, 300) };
      if (s?.schedule) {
        const c = String(s.schedule.cron || '').trim();
        const g = String(s.schedule.goal || '').trim().slice(0, 200);
        if (!/^([\d*/,-]+\s+){4}[\d*/,-]+$/.test(c) || !g) return null;
        steps.push({ type: 'schedule', cron: c, goal: g });
        continue;
      }
      if (s?.restart === true) { steps.push({ type: 'restart' }); continue; }
      if (s?.tool || (s && !s.cmd && !s.sh && Object.keys(s).some((k) => TOOLS[k.toLowerCase()]))) {
        const t = parseToolStep(s);
        if (!t) return null;
        steps.push(TOOLS[t.tool].cmd ? { type: 'cmd', cmd: TOOLS[t.tool].cmd, args: t.arg } : t);
        continue;
      }
      if (s?.panel) {
        const action = String(s.panel?.action || s.panel).toLowerCase().replace(/[^a-z]/g, '');
        steps.push(action === 'restart' ? { type: 'restart' } : { type: 'panel', action });
        continue;
      }
      if (s?.send) {
        const to = String(s.send.to || '').replace(/\D/g, '');
        const text = String(s.send.text || '').replace(/[\r\n]{3,}/g, '\n\n').slice(0, 1000).trim();
        if (to.length < 8 || to.length > 15 || !text) return null;
        steps.push({ type: 'send', to, text });
        continue;
      }
      if (s?.bulk) {
        const cmd = String(s.bulk.cmd || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const items = (Array.isArray(s.bulk.items) ? s.bulk.items : [])
          .map((i) => String(i).slice(0, MAX_ARG).replace(/[\r\n]/g, ' ').trim()).filter(Boolean);
        if (!cmd || items.length < 1) return null;
        const prev = steps[steps.length - 1];
        if (prev && prev.type === 'bulk' && prev.cmd === cmd) { prev.items.push(...items); continue; }
        steps.push({ type: 'bulk', cmd, items });
        continue;
      }
      if (s?.cmd) {
        const cmd = String(s.cmd).toLowerCase().replace(/[^a-z0-9]/g, '');
        const args = String(s.args || '').slice(0, 200).replace(/[\r\n]/g, ' ').trim();
        if (!cmd) return null;
        steps.push({ type: 'cmd', cmd, args });
        continue;
      }
      const sh = String(s?.sh || '').trim();
      if (!sh || sh.length > 300 || /\r|\n/.test(sh)) return null;
      steps.push({ type: 'sh', sh });
    }
    return steps.length ? { steps } : null;
  } catch { return null; }
}

// Turn raw shell output into a short plain-English summary for the owner.
async function summarize(raw, extraInstruction = '') {
  try {
    const r = await askAi(
      'You are Tab. This is the result of work you just did on your own server:\n\n' + String(raw).slice(0, 2500) +
      '\n\nSummarize it for the owner in 2-4 short plain English sentences with the key numbers and names. ' +
      'Do not write any commands or code. Be direct and factual.' + (extraInstruction ? ' ' + extraInstruction : ''),
      { allowKeyless: true, temperature: 0.2 });
    const t = whatsappText(String(r?.text || r || ''));
    if (t && t.length > 10) return t.slice(0, 1200);
  } catch (e) { logger.warn('[agent] summarizer failed: ' + (e?.message || 'error')); }
  return null; // caller falls back
}

function fallbackSummary(results) {
  const ok = results.filter((r) => r.code === 0).length;
  const failed = results.length - ok;
  let t = ok + ' action(s) completed' + (failed ? ', ' + failed + ' failed' : '') + '.';
  if (failed) {
    const first = results.find((r) => r.code !== 0);
    t += ' First error: ' + (first.out || 'exit ' + first.code).split('\n').filter(Boolean).slice(-1)[0].slice(0, 200);
  }
  return t;
}

// Raw output shown only on request, fresh for 10 minutes after a run.
let lastRaw = null; // {ts, text}

async function editOrReply(ctx, live, text) {
  if (live?.key) { try { return void await ctx.sock.sendMessage(ctx.jid, { text, edit: live.key }); } catch {} }
  return ctx.reply(text);
}

function fmtMB(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// ---- Deterministic junk cleanup ------------------------------------------
// "clean up junk" goals never reach the LLM planner: scan known junk spots,
// show an itemized list with sizes, delete only after YES, report MB freed.
const JUNK_DENY = /(^|\/)(auth|auth-backup|sessions?|creds|\.env|node_modules\/(?!\.cache)|package(-lock)?\.json|config\.|agent-queue\.json|agent-session\.json)/i;
function isCancelDownloadGoal(goal) {
  return /\b(cancel|stop|band|ruk jao|roko)\b/i.test(goal) && /\b(download|queue|pinterest|videos?|songs?|photos?|memes?|bulk|files?|sab|bhejna)\b/i.test(goal);
}
function isJunkCleanupGoal(goal) {
  if (/\b(check|batao|dikhao|kitna|status|how much|show)\b/i.test(goal)) return false;
  return /\b(clean ?up|cleanup|junk|saaf|hatao|free up|clear (?:the )?(?:cache|tmp|temp|logs))\b/i.test(goal);
}
function scanJunk() {
  const DAY = 864e5, now = Date.now();
  const junk = [];
  const seen = new Set();
  const push = (p, bytes, why) => {
    const rp = path.resolve(p);
    if (seen.has(rp) || JUNK_DENY.test(p)) return;
    seen.add(rp);
    junk.push({ path: p, bytes, why });
  };
  const walk = (dir, why, maxAgeMs, depth) => {
    if (depth > 4) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (JUNK_DENY.test(p)) continue;
      try {
        if (e.isDirectory()) walk(p, why, maxAgeMs, depth + 1);
        else if (e.isFile()) {
          const st = fs.statSync(p);
          if (now - st.mtimeMs > maxAgeMs) push(p, st.size, why);
        }
      } catch { /* skip */ }
    }
  };
  // old logs: keep the 2 newest
  try {
    const logs = fs.readdirSync('data/logs').filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, m: fs.statSync(path.join('data/logs', f)).mtimeMs })).sort((a, b) => b.m - a.m);
    for (const l of logs.slice(2)) { const p = path.join('data/logs', l.f); push(p, fs.statSync(p).size, 'old log'); }
  } catch { /* none */ }
  // rollback/ops archives: keep the 2 newest of each family
  for (const [dir, re, why] of [['.', /^archive-.*\.tar\.gz$/i, 'old rollback archive'], ['data', /^ops-backup-.*\.tar\.gz$/i, 'old auto backup'], ['data', /^agent-session-.*\.bak$/i, 'old session backup']]) {
    try {
      const arcs = fs.readdirSync(dir).filter((f) => re.test(f))
        .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
      for (const a of arcs.slice(2)) { const p = dir === '.' ? a.f : path.join(dir, a.f); push(p, fs.statSync(p).size, why); }
    } catch { /* none */ }
  }
  // caches: any age; tmp/download staging: older than a day
  for (const d of ['node_modules/.cache', '.cache']) walk(d, 'cache', 0, 0);
  for (const d of ['tmp', 'data/tmp', 'downloads', 'data/downloads', 'data/media', 'data/staging']) walk(d, 'leftover temp file', DAY, 0);
  return junk;
}
async function runJunkCleanup(ctx) {
  await ctx.reply('Scanning for junk (old logs, old archives, caches, temp files)...');
  const junk = scanJunk();
  if (!junk.length) return ctx.reply('No junk found - logs, archives, caches and temp folders are already clean.');
  const total = junk.reduce((s, j) => s + j.bytes, 0);
  const fmt = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const lines = junk.slice(0, 15).map((j) => '- ' + j.path + ' (' + fmt(j.bytes) + ') - ' + j.why);
  if (junk.length > 15) lines.push('- ...and ' + (junk.length - 15) + ' more');
  const cmds = junk.map((j) => 'rm -rf -- ' + JSON.stringify(j.path));
  shell.stage(cmds, { restarts: 0, note: 'Expected to free about ' + fmt(total) + '.' });
  shell.audit('JUNK SCAN found ' + junk.length + ' item(s), ' + total + ' bytes');
  return ctx.reply('Found ' + junk.length + ' junk item(s), about ' + fmt(total) + ' total:\n' + lines.join('\n') +
    '\n\nNothing is deleted yet. Reply YES within 5 minutes to delete all of these, or NO to cancel. A backup is taken automatically first.');
}

// Shared YES/NO handler used by the /agent command and the plain-text YES/NO hook.
// Returns true when the message was a pending-confirmation answer (handled).
export async function handlePendingAnswer(ctx, isYes) {
  const p = shell.getPending();
  if (!p) return false;
  if (!shell.isVerifiedOwnerDM(ctx)) return false;
  if ((p.by || 'owner') !== shell.actorOf(ctx)) return false; // a confirmation only counts from the person who asked for the action
  if (!isYes) {
    shell.clearPending();
    shell.audit('CANCELLED staged actions');
    await ctx.reply('Cancelled. Nothing was changed.');
    return true;
  }
  shell.clearPending();
  if (p.kind === 'install') return runInstallConfirmed(ctx, p);
  if (p.kind === 'mediavision') return runMediaVisionConfirmed(ctx, p);
  if (p.kind === 'update') return runUpdateConfirmed(ctx, p);
  if (p.kind === 'msgjob') return runMessageJobConfirmed(ctx, p);
  if (p.kind === 'template') return runTemplateConfirmed(ctx, p);
  if (p.kind === 'apicmd') return runApiCmdConfirmed(ctx, p);
  if (p.kind === 'restorecmd') return runRestoreCmdConfirmed(ctx, p);
  if (p.kind === 'repaircmd') return runRepairConfirmed(ctx, p);
  if (p.kind === 'restore') return runRestoreConfirmed(ctx, p);
  await ctx.reply('Confirmed - running ' + (p.cmds.length + (p.restarts || 0)) + ' action(s) now.');
  const { backup, backupFailed, results } = await shell.runStaged(p);
  if (backupFailed) return ctx.reply('Aborted - the safety backup could not be created, so nothing was run. Check disk space, then try again.');
  lastRaw = { ts: Date.now(), text: results.map((r) => '$ ' + r.cmd + ' (exit ' + r.code + ')\n' + r.out).join('\n---\n') };
  const failed = results.filter((r) => r.code !== 0).length;
  const rawForAi = results.map((r) => r.cmd + ' -> exit ' + r.code + (r.out ? '\n' + r.out : '')).join('\n');
  let text = (results.length ? ((await summarize(rawForAi, 'Say clearly what was deleted or changed and whether it all worked.')) || fallbackSummary(results)) : 'Nothing to run.');
  if (p.note) text += '\n' + p.note;
  await ctx.reply(
    (backup ? 'Backup saved: ' + backup + '\n' : 'No file backup was needed for these actions.\n') +
    (failed ? '⚠️ ' : '') + text +
    '\n(Reply "/agent raw" within 10 min to see the exact output.)');
  if (p.restarts > 0) {
    await ctx.reply('Restarting Tab now - back in about a minute.');
    try {
      const { shutdown } = await import('../connection/whatsapp.js');
      restartBot({ shutdown, log: (m) => logger.warn(m) }).catch((e) => logger.warn('[agent] restart failed: ' + (e?.message || 'error')));
    } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  }
  return true;
}

// ---- Pure questions: answer in plain English, never plan or stage --------
function isInfoQuestion(goal) {
  const g = goal.trim();
  if (/^(can|could)\s+(u|you)\b/i.test(g) && g.length <= 140) return true;
  if (/\?$/.test(g) && g.split(/\s+/).length <= 25) return true;
  return /^(can|could|kya|will|would|does|do|is|are|what|how|why|when|which|who)\b/i.test(g) && g.split(/\s+/).length <= 12 && !/\b(download|install|update|delete|clean|remove|send|run|restart|create|make|schedule)\b/i.test(g);
}
async function runInfoAnswer(ctx, goal) {
  try {
    // Real recent context, so follow-ups like "cleared?" answer about the actual last
    // task - never manufactured clearance.
    const facts = [];
    const prev = loadSession();
    if (prev) facts.push('Most recent /agent task: goal "' + prev.goal + '"; outcome: ' + prev.summary);
    try {
      const lines = fs.readFileSync(path.join('data', 'agent-audit.log'), 'utf8').trim().split('\n').slice(-8)
        .map((l) => l.replace(/^\S+\s+/, '')).filter(Boolean);
      if (lines.length) facts.push('Recent activity, newest last:\n' + lines.join('\n'));
    } catch { /* no audit log yet */ }
    const a = await askAi('You are Tab, a WhatsApp bot. The owner asks a question ABOUT your abilities or status. Answer in 2-4 short plain-English sentences. Facts you can use: /agent can install npm packages and create new commands (owner asks, confirms with YES, static-checked before going live); /agent can update one package or all packages with backup + automatic rollback; downloads via /play /video /pinterest; bulk queues with cancel via "/agent cancel downloading"; junk cleanup via "/agent clean up junk". ' +
      (facts.length ? 'Real recent state - use it for questions about recent tasks; only say something was cleared, deleted or updated if this state says so (a scan or check alone means nothing was removed yet):\n' + facts.join('\n') + '\n' : '') +
      'If the question is not about Tab, answer normally and briefly. Question: ' + goal);
    // askAi returns { text, ... } - never String() the object itself ("[object Object]" bug).
    const t = String(a?.text || a || '').trim();
    return ctx.reply((t || 'I am not sure about that.').slice(0, 900));
  } catch { return ctx.reply('I could not think that through right now - try again in a moment.'); }
}

// npm lookups go straight to the registry API - the npm CLI conflates network
// errors with "not found" and its output gets mangled by output redaction.
async function npmMeta(pkg) {
  const enc = pkg.startsWith('@') ? pkg.replace('/', '%2f') : pkg;
  try {
    const r = await fetch('https://registry.npmjs.org/' + enc, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return { exists: false };
    if (!r.ok) return { exists: null, error: 'registry returned HTTP ' + r.status };
    const j = await r.json();
    const v = j?.['dist-tags']?.latest;
    if (!v) return { exists: false };
    const d = j?.versions?.[v]?.description || j?.description || '';
    const kw = j?.versions?.[v]?.keywords || j?.keywords || [];
    return { exists: true, version: String(v), description: String(d).slice(0, 200), keywords: (Array.isArray(kw) ? kw : []).map(String).slice(0, 30) };
  } catch (e) { return { exists: null, error: String(e?.message || 'network error').slice(0, 120) }; }
}
async function npmSuggest(name) {
  try {
    const q = name.replace(/^@[^/]+\//, '').replace(/_+/g, '-');
    const r = await fetch('https://registry.npmjs.org/-/v1/search?text=' + encodeURIComponent(q) + '&size=5', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.objects || []).map((o) => ({ name: o?.package?.name, desc: String(o?.package?.description || '').slice(0, 80) })).filter((x) => x.name && x.name !== name).slice(0, 3);
  } catch { return []; }
}

// ---- Install a package + create a command (owner flow, YES-gated) --------
function parseInstallGoal(goal) {
  if (!/^\s*(install|add|npm\s+(i|install))\b/i.test(goal)) return null;
  const m = goal.match(/\b(?:npm\s+(?:i|install)|install|add)\s+(?:the\s+)?(?:npm\s+)?(?:package\s+)?(@?[a-z0-9][a-z0-9._\/-]*)/i);
  if (!m) return null;
  const pkg = m[1].replace(/\.+$/, '');
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(pkg)) return null;
  let cmdName = null;
  const cm = goal.match(/\/?([a-z][a-z0-9]{1,20})\s+command/i) || goal.match(/command\s+(?:called|named)\s+\/?([a-z][a-z0-9]{1,20})/i);
  if (cm) cmdName = cm[1].toLowerCase();
  return { pkg, cmdName };
}
function parseUpdateGoal(goal) {
  if (!/^\s*update\b/i.test(goal)) return null;
  // Strip filler words so "update to the latest patch" is not parsed as a package named "to".
  const rest = goal.replace(/^\s*update\b/i, '').trim().toLowerCase()
    .replace(/^((?:to|the|a|an|my)\s+)+/, '').replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  // "latest patch/version/release" or "itself/the bot/jarvis" mean the BOT's own code, not an npm package.
  if (/^(latest|newest|new)(\s+(patch|version|release|update))?$/.test(rest) ||
      /^(patch|version|release|itself|yourself|the\s+bot|jarvis|tab|bot|code|source)$/.test(rest)) return { botSelf: true };
  if (/^(all|everything)\b/.test(rest)) return { updateAll: true };
  const pkg = rest.split(' ')[0].replace(/\.+$/, '');
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(pkg)) return null;
  return { pkg };
}
const INSTALL_GOAL_STOP = new Set(['install', 'make', 'add', 'create', 'command', 'cmd', 'new', 'the', 'and', 'for', 'with', 'use', 'using', 'please', 'that', 'this', 'bot', 'jarvis', 'like', 'app', 'me', 'force']);
export function installGoalTokens(goal, pkg) {
  const base = String(pkg || '').toLowerCase().replace(/^@[^/]+\//, '');
  return new Set(String(goal || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !INSTALL_GOAL_STOP.has(t) && t !== base));
}

// ---- System status (deterministic, read-only) -----------------------------
export function isSystemStatusGoal(goal) {
  const g = String(goal || '').trim();
  if (!g) return false;
  if (/\b(clean|clear|delete|remove|wipe|free up|install|update|upgrade|download|restart|kill|fix|repair|add|create|make|send)\b/i.test(g)) return false;
  if (/how\s+long.*(running|up\b)/i.test(g)) return true;
  if (!/\b(disk|storage|space|memory|ram|uptime|cpu|load)\b/i.test(g)) return false;
  return /(available|free|used|total|left|remain|usage|how much|how many|status|current|check|show|what|is there|\?)/i.test(g);
}
async function runSystemStatus(ctx) {
  const lines = [];
  try {
    const sf = fs.statfsSync('.');
    const total = sf.blocks * sf.bsize, free = sf.bavail * sf.bsize, used = total - free;
    lines.push('Disk (container filesystem): ' + fmtMB(free) + ' free of ' + fmtMB(total) + ' total (' + fmtMB(used) + ' used).');
    lines.push('Note: the hosting panel may display its disk quota as Unlimited - that is only the panel setting; the filesystem numbers above are the real ones.');
  } catch (e) {
    lines.push('Disk: could not read the filesystem (' + String(e?.message || e).slice(0, 80) + ').');
  }
  lines.push('Tab memory in use (RSS): ' + fmtMB(process.memoryUsage().rss) + '.');
  const up = Math.floor(process.uptime());
  lines.push('Tab uptime: ' + Math.floor(up / 3600) + 'h ' + Math.floor((up % 3600) / 60) + 'm (since last restart).');
  shell.audit('SYSTEM STATUS read (disk/mem/uptime)');
  return ctx.reply(lines.join('\n'));
}

// ---- Media-aware goals (photo in the command message or quoted) -----------
export function mediaGoalRoute(goal) {
  const g = String(goal || '').trim();
  if (!g) return { kind: 'usage' };
  if (/\b(install|update|upgrade|delete|remove|clean|download|schedule|undo|retry|restore)\b/i.test(g)) return null;
  if (/\b(enhance|upscale|remini|sharpen|denoise|deblur|clearer|hd)\b|improve (the |this |that )?(photo|pic|image)|fix (the |this |that )?(photo|pic|image)/i.test(g)) {
    const mode = /sharpen/i.test(g) ? 'sharpen' : (/denoise|deblur/i.test(g) ? 'denoise' : 'upscale');
    return { kind: 'enhance', mode };
  }
  if (/\b(what|who|describe|read|text|say|says|written|ocr|translate|identify|count|tell me about|mean|is there|are there)\b/i.test(g)) {
    return { kind: 'vision', question: g.slice(0, 300) };
  }
  return null;
}
async function runMediaVisionConfirmed(ctx, p) {
  const mv = p.mediavision || {};
  if (!mv.question || !mv.msg) return ctx.reply('That confirmation expired - send the photo and question again.');
  const vcmd = registry.get('vision');
  if (!vcmd) return ctx.reply('The vision command is not available right now.');
  shell.audit('MEDIA GOAL vision CONFIRMED - photo sent to vision provider after explicit YES');
  try {
    await vcmd.run({ ...ctx, msg: mv.msg, args: String(mv.question).split(/\s+/).slice(0, 60) });
  } catch (e) {
    logger.warn('[agent] media vision failed: ' + (e?.message || 'error'));
    await ctx.reply('Could not read that photo (' + String(e?.message || 'error').slice(0, 100) + ').');
  }
  return true;
}

// ---- npm candidate search (free registry API; user always picks) ----------
const ADULT_PKG = /xvideos|xnxx|porn|nsfw|xxx|hentai|redtube|youporn|adult|erotic/i;
export function filterPkgCandidates(objects, goalToks, excludePkg) {
  const scored = [];
  for (const o of objects || []) {
    const p = o && o.package;
    if (!p || !p.name) continue;
    const text = (p.name + ' ' + (p.description || '') + ' ' + (p.keywords || []).join(' ')).toLowerCase();
    if (ADULT_PKG.test(text)) continue;
    if (p.name.toLowerCase() === String(excludePkg || '').toLowerCase()) continue;
    const toks = new Set(text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
    let score = 0;
    for (const t of goalToks) if (toks.has(t)) score++;
    if (score > 0) scored.push({ name: p.name, desc: String(p.description || '').slice(0, 90), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}
async function npmSearchCandidates(goal, excludePkg) {
  const toks = [...installGoalTokens(goal, excludePkg)].slice(0, 4);
  if (!toks.length) return [];
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('https://registry.npmjs.org/-/v1/search?text=' + encodeURIComponent(toks.join(' ')) + '&size=6', { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return [];
    const j = await r.json();
    return filterPkgCandidates(j.objects, installGoalTokens(goal, excludePkg), excludePkg);
  } catch { return []; }
}

// ---- Static pre-install inspection (NO package code execution) -----------
// Reads registry metadata and walks the tarball's file list + package.json only.
// Never installs, imports or runs anything from the package before the real
// owner-confirmed npm install. Catches deprecations and surprises (install
// scripts, huge/binary payloads); the post-install import probe + rollback
// remains the backstop for broken publications.
async function staticPkgInspect(pkg, version) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const metaR = await fetch('https://registry.npmjs.org/' + encodeURIComponent(pkg).replace(/%40/, '@').replace(/%2F/i, '/') + '/' + (version || 'latest'), { signal: ctl.signal });
    if (!metaR.ok) return { inconclusive: true, why: 'registry metadata unreadable (HTTP ' + metaR.status + ')' };
    const doc = await metaR.json();
    if (doc.deprecated) return { blocked: true, why: pkg + (version ? '@' + version : '') + ' is DEPRECATED on npm: "' + String(doc.deprecated).slice(0, 120) + '".' };
    const tarUrl = doc.dist && doc.dist.tarball;
    if (!tarUrl) return { inconclusive: true, why: 'no tarball URL in registry metadata' };
    const tarR = await fetch(tarUrl, { signal: ctl.signal });
    if (!tarR.ok) return { inconclusive: true, why: 'tarball unreadable (HTTP ' + tarR.status + ')' };
    const buf = new Uint8Array(await tarR.arrayBuffer());
    if (buf.length > 30 * 1048576) return { inconclusive: true, why: 'tarball over 30MB (' + Math.round(buf.length / 1048576) + 'MB) - inspect manually' };
    // gunzip (npm tarballs are .tgz); if not gzipped, walk as plain tar
    let tar = buf;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const { gunzipSync } = await import('node:zlib');
      tar = gunzipSync(buf);
    }
    // Minimal tar walk: 512-byte headers, name@0..100, size(octal)@124..136
    const files = [];
    let pkgJson = null;
    let off = 0;
    const dec = new TextDecoder();
    while (off + 512 <= tar.length && files.length < 4000) {
      const name = dec.decode(tar.subarray(off, off + 100)).replace(/\0.*$/, '');
      if (!name) break;
      const sizeOct = dec.decode(tar.subarray(off + 124, off + 136)).replace(/\0.*$/, '').trim();
      const size = parseInt(sizeOct || '0', 8) || 0;
      files.push(name);
      if (/package\.json$/.test(name) && !pkgJson && size < 200000) {
        try { pkgJson = JSON.parse(dec.decode(tar.subarray(off + 512, off + 512 + size))); } catch {}
      }
      off += 512 + Math.ceil(size / 512) * 512;
    }
    const scripts = (pkgJson && pkgJson.scripts) || {};
    const lifecycle = ['preinstall', 'install', 'postinstall', 'prepublish', 'prepare'].filter((k) => scripts[k]);
    shell.audit('STATIC INSPECT ' + pkg + ': ' + files.length + ' files, lifecycle scripts: ' + (lifecycle.join(',') || 'none'));
    return {
      ok: true,
      fileCount: files.length,
      lifecycle,
      hasBinary: files.some((f) => /\.(node|so|dll|dylib|exe)$/.test(f)),
      unpackedSize: doc.dist.unpackedSize || null,
    };
  } catch (e) {
    return { inconclusive: true, why: String(e?.message || e).slice(0, 120) };
  } finally { clearTimeout(to); }
}

async function runInstallFlow(ctx, goal) {
  const parsed = parseInstallGoal(goal);
  if (!parsed) return ctx.reply('Tell me the package, e.g. "/agent install mathjs make a calc command".');
  const { pkg } = parsed;
  await ctx.reply('Checking ' + pkg + ' on npm...');
  const meta = await npmMeta(pkg);
  if (meta.exists === null) return ctx.reply('The npm registry could not be reached just now (' + (meta.error || 'network error') + '), so I cannot verify "' + pkg + '". Try again in a moment.');
  if (!meta.exists) {
    const sugg = await npmSuggest(pkg);
    return ctx.reply('npm has no package called "' + pkg + '" (checked registry.npmjs.org directly).' +
      (sugg.length ? '\nClosest real packages:\n' + sugg.map((s) => '- ' + s.name + (s.desc ? ': ' + s.desc : '')).join('\n') + '\nSay e.g. "/agent install ' + sugg[0].name + '" to use one.' : '\nNo close matches found either - double-check the name.'));
  }
  let cmdName = parsed.cmdName || pkg.replace(/^@[^/]+\//, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 15);
  if (registry.get(cmdName)) return ctx.reply('/' + cmdName + ' already exists - pick another command name, e.g. "/agent install ' + pkg + ' make a ' + cmdName + '2 command".');
  // Qualify the package against the stated goal: when the npm description/keywords share
  // NO vocabulary with the request, do NOT stage a YES-able plan - a reflexive YES is how
  // the wrong "remini" (React state lib) got installed for a photo-enhance goal. Show real
  // alternatives from npm search and require a deliberate "force" to override.
  const force = /\bforce\b/i.test(goal);
  const goalToks = installGoalTokens(goal, pkg);
  const descToks = new Set((String(meta.description || '') + ' ' + (meta.keywords || []).join(' ')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
  const hit = [...goalToks].some((t) => descToks.has(t) || (t.length > 4 && [...descToks].some((d) => d.startsWith(t) || t.startsWith(d))));
  if (goalToks.size && !hit && !force) {
    const cands = await npmSearchCandidates(goal, pkg);
    shell.audit('INSTALL BLOCKED mismatch ' + pkg + ' (goal tokens: ' + [...goalToks].slice(0, 6).join(',') + ')');
    const lines = ['Hold on - npm describes "' + pkg + '" as "' + String(meta.description || 'no description').slice(0, 100) + '", which shares nothing with what you asked (' + [...goalToks].slice(0, 6).join(', ') + '). Brand names are often unrelated packages, so I did NOT stage this install.'];
    if (cands.length) {
      lines.push('Closer matches on npm for your goal:\n' + cands.map((c) => '- ' + c.name + (c.desc ? ': ' + c.desc : '')).join('\n') + '\nYou pick - I never swap packages silently. Say e.g. "/agent install ' + cands[0].name + '" to use one.');
    } else {
      lines.push('npm search found no closer match either - this may need a hand-written command or an existing Tab feature instead.');
    }
    lines.push('If you are sure "' + pkg + '" is really what you want, say "/agent install ' + pkg + ' force' + (parsed.cmdName ? ' make a ' + parsed.cmdName + ' command' : '') + '".');
    return ctx.reply(lines.join('\n'));
  }
  shell.stage([], { kind: 'install', install: { pkg, version: meta.version, cmdName, desc: String(meta.description || '').slice(0, 150), finalFile: path.join('src', 'commands', cmdName + '.js') } });
  shell.audit('INSTALL STAGED ' + pkg + '@' + meta.version + ' as /' + cmdName + (force ? ' (FORCED by owner despite mismatch)' : ''));
  const mismatchNote = goalToks.size && !hit
    ? '\nNote: you forced this past a vocabulary mismatch - npm describes "' + pkg + '" as "' + String(meta.description || 'no description').slice(0, 100) + '".'
    : '';
  return ctx.reply('Plan: install ' + pkg + ' v' + meta.version + ' and add a new /' + cmdName + ' command (' + String(meta.description || 'no description').slice(0, 120) + '). A static pre-check (no package code run) plus the post-install import probe protect it; after static checks (safety scan + syntax, no generated code run) pass, Tab restarts and /' + cmdName + ' is live.' + mismatchNote + '\nNothing is installed yet. Reply YES within 5 minutes to go ahead, or NO to cancel.');
}
async function probeExports(pkg) {
  const script = "const { createRequire } = await import('node:module');"
    + "const req = createRequire(process.cwd() + '/x.js');"
    + "let specs = [];"
    + "try { const pj = req('./node_modules/' + process.argv[1] + '/package.json');"
    + " specs = Object.keys(pj.exports || {}).filter(k => k !== './package.json' && !/nsfw/i.test(k)).map(k => k === '.' ? process.argv[1] : process.argv[1] + '/' + k.slice(2)); } catch {}"
    + "if (!specs.includes(process.argv[1])) specs.unshift(process.argv[1]);"
    + "const out = {};"
    + "for (const s of specs.slice(0, 8)) {"
    + " try { const m = await import(s); out[s] = { keys: Object.keys(m).slice(0, 25), hasDefault: !!m.default }; }"
    + " catch (e) { out[s] = { probeError: String(e.message || e).slice(0, 120) }; }"
    + "}"
    + "console.log(JSON.stringify(out));";
  const r = await shell.execShell('node --input-type=module -e "' + script + '" ' + JSON.stringify(pkg), { timeoutMs: 60000 });
  try { return JSON.parse((r.out || '').trim().split('\n').pop()); } catch { return {}; }
}
/** Plain-English effects of a generated body, for informed owner approval.
 *  Deterministic extraction only - recipients, external hosts, disk writes, multi-turn. */
export function effectsSummary(body) {
  const b = String(body || '');
  const hosts = [...b.matchAll(/https:\/\/([\w.-]+)/g)].map((m) => m[1]).filter((h, i, a) => a.indexOf(h) === i).slice(0, 4);
  const writesData = /writeFileSync|appendFileSync|createWriteStream/.test(b) && /data[\/'"]/.test(b);
  const media = /sendMessage\(ctx\.jid/.test(b);
  const multi = /sessions\.js|S\.begin\(/.test(b);
  const effects = ['replies only in the chat that calls it' + (media ? ' (can include media)' : '')];
  effects.push(hosts.length ? 'contacts ' + hosts.join(', ') + ' over https' : 'makes no external network calls');
  effects.push(writesData ? 'stores small files in its own data/ folder' : 'writes nothing to disk');
  if (multi) effects.push('while active it reads the next plain messages in that chat (multi-turn)');
  return effects.join('; ') + '.';
}

export function bodyProblem(b) {
  if (!b) return 'the AI returned nothing';
  if (/export\s+default|module\.exports/.test(b)) return 'it included export statements (inner statements only, no exports)';
  if (/^\s*import\s/m.test(b)) return 'it used import statements (load the package with await import() inside the body instead)';
  if (/\brequire\s*\(/.test(b)) return 'it used require() (use await import() inside the body instead)';
  if (/process\.env|auth\/|auth-backup|\.env\b|child_process|\bexecSync\b|\bspawn\b/.test(b)) return 'it touched env/secrets/shell (not allowed)';
  if (/\beval\s*\(|new\s+Function\s*\(/.test(b)) return 'it used eval/Function (not allowed)';
  if (/api-keys|dashboard-token|install-id|session-state/.test(b)) return 'it touched sensitive data files (not allowed)';
  if (/@s\.whatsapp\.net|@g\.us|@broadcast|@newsletter/.test(b)) return 'it named a specific chat or number (generated code must only reply to the calling chat)';
  if (/sendMessage\s*\(\s*(?!ctx\.jid\b|sctx\.jid\b)/.test(b)) return 'it messaged a chat other than the caller (ctx.reply or ctx.jid only)';
  if (/169\.254\.|127\.0\.0\.1|\blocalhost\b|0\.0\.0\.0|\[::1\]|\b10\.\d+\.\d+\.\d+|192\.168\.|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|metadata\.google/.test(b)) return 'it targeted a local or private network address (not allowed)';
  if (/['"`]http:\/\//.test(b)) return 'it used plain http (https only)';
  if (/(?:writeFileSync|appendFileSync|createWriteStream|mkdirSync|rmSync|unlinkSync|renameSync|copyFileSync|cpSync)\s*\(\s*['"`](?!\/tmp[\/'"]|data[\/'"])/.test(b)) return 'it wrote outside data/ and /tmp (not allowed)';
  return null;
}
// apicmd bodies must route every network call through the guarded ctx.fetchPublic
// helper; bare fetch of an AI-invented destination is rejected before install.
export function apicmdNetworkOk(b) {
  const stripped = String(b || '').replace(/ctx\.fetchPublic\s*\(/g, '');
  if (/(^|[^\w.])fetch\s*\(/.test(stripped)) return 'it used bare fetch (use ctx.fetchPublic(url) - it validates and pins the destination and returns {status, body:Buffer})';
  return null;
}
async function runInstallConfirmed(ctx, p) {
  const { pkg, version, cmdName, desc, finalFile } = p.install;
  const tmpFile = path.join('src', 'commands', '_newcmd-' + cmdName + '.js');
  await ctx.reply('Confirmed - backing up package files, installing ' + pkg + ', writing /' + cmdName + ', static-checking, then restarting...');
  const mb = await shell.backupManifests();
  if (!mb) return ctx.reply('Aborted - could not back up package.json/package-lock.json first. Nothing was changed.');
  shell.audit('INSTALL ' + pkg + ' manifest backup: ' + mb);
  const insp = await staticPkgInspect(pkg, version);
  if (insp && insp.blocked) {
    return ctx.reply('Pre-check failed: ' + insp.why + ' Nothing was installed - manifests untouched. Try a different package/version or ask me to hand-write the command.');
  }
  if (insp && insp.ok) await ctx.reply('Static pre-check (no package code executed): ' + insp.fileCount + ' files' + (insp.lifecycle.length ? ', HAS install scripts (' + insp.lifecycle.join(', ') + ') - these run during npm install' : ', no install scripts') + (insp.hasBinary ? ', contains native binaries' : '') + '. Installing for real now...');
  if (insp && insp.inconclusive) await ctx.reply('Static pre-check inconclusive (' + insp.why + '). The post-install import probe and rollback still protect you. Installing...');
  const inst = await shell.execShell('npm install ' + JSON.stringify(pkg) + ' --no-audit --no-fund', { timeoutMs: 240000 });
  shell.audit('INSTALL ' + pkg + ' -> exit ' + inst.code);
  if (inst.code !== 0) return ctx.reply('npm install failed, nothing was added:\n' + String(inst.out || '').slice(-400));
  const rollback = async (why) => {
    await shell.execShell('cp ' + JSON.stringify(mb + '/package.json') + ' ' + JSON.stringify(mb + '/package-lock.json') + ' . && npm ci --no-audit --no-fund', { timeoutMs: 300000 });
    try { fs.unlinkSync(tmpFile); } catch {}
    shell.audit('INSTALL ' + pkg + ' rolled back: ' + why.slice(0, 120));
  };
  const exp = await probeExports(pkg);
  shell.audit('INSTALL probe ' + pkg + ': ' + JSON.stringify(exp).slice(0, 200));
  const working = Object.entries(exp).filter(([, v]) => v && !v.probeError);
  const broken = Object.entries(exp).filter(([, v]) => v && v.probeError);
  if (Object.keys(exp).length && !working.length) {
    const first = broken[0];
    await rollback('no importable entry point: ' + (first ? first[0] + ' -> ' + first[1].probeError : 'probe failed'));
    return ctx.reply('Installed ' + pkg + ' but its published code cannot be imported at all (broken package publication). ' + (first ? 'import(\'' + first[0] + '\') fails: ' + first[1].probeError : '') + ' Rolled back: package uninstalled, no command added. This needs a different package version or a hand-written command.');
  }
  const expLine = 'Real import probe of the installed package (run against the ACTUAL installed files):\n'
    + working.map(([s, v]) => '- import(\'' + s + '\') WORKS. Its real exports: ' + (v.keys && v.keys.length ? v.keys.join(', ') : '(none)') + '.' + (v.hasDefault ? ' It HAS a default export.' : ' It has NO default export.')).join('\n')
    + (broken.length ? '\n' + broken.map(([s, v]) => '- import(\'' + s + '\') FAILS (' + v.probeError + ') - NEVER import this specifier.').join('\n') : '')
    + '\nOnly use import specifiers marked WORKS and only the exports listed for them. Never guess export names or deep file paths that are not listed.';
  await ctx.reply('Writing the /' + cmdName + ' command...');
  const bodyPrompt = 'Write ONLY the JavaScript statements that go INSIDE an async run(ctx) {} function for a WhatsApp bot command named "/' + cmdName + '" using the npm package "' + pkg + '" (' + (desc || 'no description') + ').\n' + expLine + '\nOwner request: install ' + pkg + ' and provide /' + cmdName + '.\nRules:\n- Output ONLY raw JavaScript statements. No markdown, no code fences, no explanation, no function wrapper, NO export statements, NO import statements.\n- Load the package inside the body with await import() using the REAL exports listed above.\n- ctx.args is the user\'s words as a string array (at least one is guaranteed); await ctx.reply(text) sends a plain reply; keep replies short, plain English.\n- NEVER read or print process.env, tokens, keys, .env, or files under auth/. No child_process, no shell, no writes outside /tmp.\n- On missing input, reply with the usage line. Wrap risky work in try/catch and on failure reply with the actual error message (first 100 chars), never a generic "failed" message. Keep it under 30 lines.';
  let code = null; let lastFail = '';
  for (let attempt = 1; attempt <= 3 && !code; attempt++) {
    let body = '';
    try {
      const r = await ai(bodyPrompt + (lastFail ? '\nYour previous attempt was rejected because ' + lastFail + '. Output corrected statements only.' : ''), { temperature: 0.3 }, 'codegen');
      body = r && r.text ? r.text : '';
    } catch (e) { lastFail = 'the AI call failed (' + (e?.message || 'error') + ')'; continue; }
    body = String(body || '').trim().replace(/^```(?:js|javascript)?\s*/im, '').replace(/```\s*$/, '').trim();
    const prob = bodyProblem(body);
    if (prob) { lastFail = prob; shell.audit('CODEGEN attempt ' + attempt + ' rejected: ' + prob); continue; }
    const candidate = buildCommandFile(cmdName, { desc: (desc || pkg + ' helper').slice(0, 90), usage: '<input>', minArgs: 1, body });
    const gv = validateGeneratedSource(candidate, body);
    if (!gv.ok) { lastFail = 'structural gate: ' + gv.why; shell.audit('CODEGEN attempt ' + attempt + ' structural rejection: ' + gv.why); continue; }
    const chkFile = path.join('src', 'commands', '_chk-' + cmdName + '.mjs');
    try { fs.writeFileSync(chkFile, candidate); } catch { lastFail = 'could not stage a temp file'; continue; }
    const chk = await shell.execShell('node --check ' + JSON.stringify(chkFile), { timeoutMs: 30000 });
    try { fs.unlinkSync(chkFile); } catch {}
    if (chk.code === 0) { code = candidate; break; }
    lastFail = 'syntax error: ' + String(chk.out || '').trim().split('\n').slice(-2).join(' ').slice(0, 150);
    shell.audit('CODEGEN attempt ' + attempt + ' syntax error: ' + lastFail.slice(0, 100));
  }
  if (!code) { await rollback('codegen failed: ' + lastFail); return ctx.reply('I could not generate working code for /' + cmdName + ' after 3 tries (last issue: ' + lastFail + '). Rolled back: package uninstalled, nothing added - try again or rephrase.'); }
  fs.writeFileSync(tmpFile, code);
  // STATIC-ONLY validation for arbitrary codegen bodies: safety scan + syntax
  // check happened above; the generated module is NEVER imported or executed
  // here (not in this process, not in a child). Functional behavior stays
  // UNVERIFIED until the owner actually runs the command.
  const selfTestNote = 'passed static checks only (safety scan + syntax; functional behavior UNVERIFIED until you run it)';
  shell.audit('INSTALL static validation passed for /' + cmdName + ' (no generated code executed)');
  fs.renameSync(tmpFile, finalFile);
  noteGenerated(cmdName, { pkg, version, file: finalFile, source: 'install', probeKeys: working.flatMap(([, v]) => v.keys || []).slice(0, 40) });
  shell.audit('COMMAND ADDED /' + cmdName + ' (package ' + pkg + ')');
  await ctx.reply('Installed ' + pkg + (version ? ' v' + version : '') + '. /' + cmdName + ' ' + selfTestNote + '. Restarting Tab now - back in about a minute. Honest note: real features are only proven when you run them; if /' + cmdName + ' errors, it will now show the real reason. (Rollback: "/agent remove the ' + cmdName + ' command".)');
  try { const { shutdown } = await import('../connection/whatsapp.js'); restartBot({ shutdown, log: (m) => logger.warn(m) }).catch((e) => logger.warn('[agent] restart failed: ' + (e?.message || 'error'))); } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  return true;
}
async function runUpdateFlow(ctx, goal) {
  const parsed = parseUpdateGoal(goal);
  if (!parsed) return ctx.reply('Say "/agent update all" or "/agent update <package>". For the bot code itself, say "/agent update to latest patch".');
  if (parsed.botSelf) {
    // Bot CODE update request, not an npm package: check GitHub read-only. Never auto-apply,
    // never touch npm packages from this path.
    try {
      const { updater } = await import('../ops/index.js');
      const n = await updater.check(true);
      if (!n) return ctx.reply('Tab code is already at the latest patch on GitHub - nothing to update.');
      return ctx.reply('There is a newer Tab code patch on GitHub (commit ' + String(n.sha).slice(0, 10) + (n.version ? ', v' + n.version : '') + '). No package was touched or installed. Bot-code updates only go through the checked "/update" flow or a tested deployment.' + (n.blockedReason ? ' Note: ' + n.blockedReason : ''));
    } catch (e) {
      return ctx.reply('I could not check GitHub for the latest Tab patch just now (' + String(e?.message || 'error').slice(0, 120) + '). Try again in a moment.');
    }
  }
  await ctx.reply('Checking for updates...');
  const list = [];
  if (parsed.updateAll) {
    const r = await shell.execShell('npm outdated --json', { timeoutMs: 90000 });
    let out = null;
    try { out = JSON.parse((r.out || '').trim().split('\n{').length > 1 ? '{' + (r.out || '').trim().split('\n{').pop() : (r.out || '{}')); } catch { out = null; }
    if (out === null) return ctx.reply('The update check failed (' + String(r.out || 'exit ' + r.code).slice(0, 150).replace(/\n/g, ' ') + '). Try again in a moment.');
    for (const [name, info] of Object.entries(out)) {
      if (!info?.current || !info?.latest) continue;
      const major = String(info.current).split('.')[0] !== String(info.latest).split('.')[0];
      list.push({ name, from: info.current, to: info.latest, major });
    }
    if (!list.length) return ctx.reply('Everything is already up to date.');
  } else {
    const inst = (() => { try { return JSON.parse(fs.readFileSync(path.join('node_modules', parsed.pkg, 'package.json'), 'utf8')).version; } catch { return null; } })();
    const meta = await npmMeta(parsed.pkg);
    if (meta.exists === null) return ctx.reply('The npm registry could not be reached just now (' + (meta.error || 'network error') + '), so I cannot check "' + parsed.pkg + '". Try again in a moment.');
    if (!meta.exists) return ctx.reply('npm has no package called "' + parsed.pkg + '" (checked registry.npmjs.org directly).');
    const latest = meta.version;
    if (!inst) return ctx.reply(parsed.pkg + ' is not installed. Use "/agent install ' + parsed.pkg + ' ..." instead.');
    if (inst === latest) return ctx.reply(parsed.pkg + ' is already at the latest version (' + latest + ').');
    list.push({ name: parsed.pkg, from: inst, to: latest, major: inst.split('.')[0] !== latest.split('.')[0] });
  }
  const majors = list.filter((u) => u.major);
  const baileys = list.some((u) => /baileys/i.test(u.name));
  const shown = list.slice(0, 12).map((u) => '- ' + u.name + ' ' + u.from + ' -> ' + u.to + (u.major ? ' (MAJOR bump)' : ''));
  if (list.length > 12) shown.push('- ...and ' + (list.length - 12) + ' more');
  shell.stage([], { kind: 'update', install: { plan: list, updateAll: !!parsed.updateAll } });
  shell.audit('UPDATE STAGED ' + list.length + ' package(s): ' + list.slice(0, 8).map((u) => u.name + '@' + u.to).join(', '));
  return ctx.reply('Updates available (' + list.length + '):\n' + shown.join('\n') +
    (majors.length ? '\n⚠️ Major version bump(s): ' + majors.map((u) => u.name).join(', ') + ' - higher risk of breakage.' : '') +
    (baileys ? '\n⚠️ Baileys is in the list: Tab patches parts of it, so the post-update self-test matters extra here.' : '') +
    '\nA backup of package.json + package-lock.json is taken first; if the self-test after restart fails, Tab rolls back automatically. Nothing is changed yet. Reply YES within 5 minutes to update, or NO to cancel.');
}
async function runUpdateConfirmed(ctx, p) {
  const { plan, updateAll } = p.install;
  const backupDir = path.join('data', 'ops-backup-pkg-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  await ctx.reply('Confirmed - backing up package files, then updating ' + plan.length + ' package(s)...');
  const bk = await shell.execShell('mkdir -p ' + JSON.stringify(backupDir) + ' && cp package.json package-lock.json ' + JSON.stringify(backupDir) + '/', { timeoutMs: 30000 });
  if (bk.code !== 0) return ctx.reply('Backup failed - refusing to update without a rollback path. Nothing was changed.');
  const cmd = updateAll ? 'npm update --no-audit --no-fund' : plan.map((u) => 'npm install ' + JSON.stringify(u.name + '@' + u.to) + ' --no-audit --no-fund').join(' && ');
  const r = await shell.execShell(cmd, { timeoutMs: 300000 });
  shell.audit('UPDATE ran (' + plan.length + ' pkg) -> exit ' + r.code);
  if (r.code !== 0) {
    await shell.execShell('cp ' + JSON.stringify(backupDir) + '/package.json ' + JSON.stringify(backupDir) + '/package-lock.json . && npm ci --no-audit --no-fund', { timeoutMs: 300000 });
    return ctx.reply('The update command failed; the backup was restored. Nothing changed.\n' + String(r.out || '').slice(-300));
  }
  const chk = await shell.execShell('npm ls ' + plan.slice(0, 3).map((u) => JSON.stringify(u.name)).join(' '), { timeoutMs: 60000 });
  if (chk.code !== 0) {
    await shell.execShell('cp ' + JSON.stringify(backupDir) + '/package.json ' + JSON.stringify(backupDir) + '/package-lock.json . && npm ci --no-audit --no-fund', { timeoutMs: 300000 });
    return ctx.reply('The updated packages failed a consistency check; the backup was restored. Nothing changed.');
  }
  const compatNotes = [];
  for (const u of plan) {
    const affected = loadGenerated().filter((g) => g.pkg === u.name);
    if (!affected.length) continue;
    const exp = await probeExports(u.name);
    const nowKeys = Object.values(exp).filter((v) => v && !v.probeError).flatMap((v) => v.keys || []);
    for (const g of affected) {
      const missing = nowKeys.length ? (g.probeKeys || []).filter((k) => !nowKeys.includes(k)) : [];
      if (missing.length) compatNotes.push('/' + g.name + ': export(s) gone after update: ' + missing.slice(0, 5).join(', '));
      else noteGenerated(g.name, { probeKeys: nowKeys.slice(0, 40) });
    }
  }
  const desc = updateAll ? plan.length + ' packages updated' : plan.map((u) => u.name + ' ' + u.from + '->' + u.to).join(', ');
  const { markPending } = await import('../utilities/updateguard.js');
  markPending({ desc, backupDir });
  shell.audit('UPDATE done, restarting for self-test: ' + desc);
  await ctx.reply('Updated ' + desc + '. Restarting Tab for the post-update self-test - back in about a minute. If the self-test fails, the backup is restored automatically.');
  if (compatNotes.length) await ctx.reply('⚠️ Compatibility warning:\n' + compatNotes.join('\n') + '\nIf the command starts failing, say "/agent repair <name>".');
  try { const { shutdown } = await import('../connection/whatsapp.js'); restartBot({ shutdown, log: (m) => logger.warn(m) }).catch((e) => logger.warn('[agent] restart failed: ' + (e?.message || 'error'))); } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  return true;
}

// ---- Conversation memory (30 min) ---------------------------------------
const SESSION_FILE = path.join('data', 'agent-session.json');
function loadSession() {
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() - s.ts < 30 * 60e3) return s;
  } catch { /* none */ }
  return null;
}
function saveSession(goal, summary) {
  try {
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ goal: String(goal).slice(0, 300), summary: String(summary).slice(0, 500), ts: Date.now() }));
  } catch { /* best effort */ }
}

// ---- Scheduled tasks ------------------------------------------------------
const SCHED_FILE = path.join('data', 'agent-schedules.json');
const schedJobs = new Map(); // id -> cron task
function loadSchedules() {
  try { return JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')); } catch { return []; }
}
function saveSchedules(list) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(SCHED_FILE, JSON.stringify(list, null, 1)); } catch { /* best effort */ }
}
function ownerDM() {
  return String(config.ownerNumber).replace(/\D/g, '') + '@s.whatsapp.net';
}
// Jobs started by a verified operator (see permissions/operators.js) remember who made them ("by") and report back to that person's own DM.
const opJid = (by) => (by && /^[1-9]\d{6,14}$/.test(String(by)) ? String(by) + '@s.whatsapp.net' : ownerDM());
const actorAllowed = (by) => !by || operatorNumbers().includes(String(by));
const reportJid = (by) => (actorAllowed(by) ? opJid(by) : ownerDM()); // a revoked operator's leftovers fall back to the owner
function jobCtx(s, by, text, idPrefix) {
  const jid = opJid(by);
  const num = by ? String(by) : String(config.ownerNumber).replace(/\D/g, '');
  return {
    sock: s, jid, sender: num, senderJid: jid, isOwner: true, operator: by ? String(by) : undefined, isGroup: false, job: idPrefix,
    msg: { key: { remoteJid: jid, fromMe: false, id: idPrefix + Date.now() }, message: { conversation: '/agent ' + text } },
    text, commands: registry, args: text.split(/\s+/),
    reply: (t, o) => s.sendMessage(jid, { text: t, ...(o || {}) }),
  };
}
function scheduleOne(entry) {
  if (!cron.validate(entry.cron) || entry.active === false) return false;
  const task = cron.schedule(entry.cron, async () => {
    const s = getSock();
    if (!s) { logger.warn('[agent] schedule "' + (entry.goal || entry.topic || '').slice(0, 40) + '" skipped: no live connection'); return; }
    if (!actorAllowed(entry.by)) { shell.audit('SCHEDULE SKIPPED id=' + entry.id + ' (creator no longer an operator)'); return; }
    if (entry.kind === 'message') { await runMessageJob(entry); return; }
    shell.audit('SCHEDULE FIRED id=' + entry.id + (entry.by ? ' by=' + String(entry.by).slice(-2) : '') + ' goal="' + entry.goal.slice(0, 120) + '"');
    const ctx = jobCtx(s, entry.by, entry.goal, 'AGENTSCHED');
    try { await shell.actorStore.run({ actor: shell.actorOf(ctx) }, () => runShellMode(ctx, entry.goal)); }
    catch (e) { logger.warn('[agent] scheduled run failed: ' + (e?.message || 'error')); }
  });
  schedJobs.set(entry.id, task);
  return true;
}
export function stopAllSchedules() { for (const t of schedJobs.values()) { try { t.stop(); } catch {} } schedJobs.clear(); }
function initSchedules() {
  for (const e of loadSchedules()) {
    try { scheduleOne(e); } catch { /* skip bad entry */ }
  }
  const n = schedJobs.size;
  if (n) logger.info('[agent] ' + n + ' scheduled task(s) armed');
}

// ---- Durable task registry (survives restarts) ----------------------------
const TASKS_FILE = path.join('data', 'agent-tasks.json');
function loadTasks() { try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch { return []; } }
function saveTasks(list) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(TASKS_FILE, JSON.stringify(list.slice(-50), null, 1)); } catch { /* best effort */ }
}
function taskStart(goal) {
  const list = loadTasks();
  const actor = shell.actorStore.getStore()?.actor || '';
  const t = { id: Math.random().toString(36).slice(2, 8), goal: String(goal).slice(0, 200), status: 'running', startedAt: Date.now(), resumeCount: 0, ...(actor.startsWith('op:') ? { by: actor.slice(3) } : {}) };
  list.push(t); saveTasks(list);
  return t.id;
}
function taskFinish(id, status, note) {
  const list = loadTasks();
  const t = list.find((x) => x.id === id);
  if (t) { t.status = status; t.finishedAt = Date.now(); t.note = String(note || '').slice(0, 200); saveTasks(list); }
}
function taskCheckpoint(id, transcript) {
  const list = loadTasks();
  const t = list.find((x) => x.id === id);
  if (t && t.status === 'running') { t.transcript = transcript.slice(-12); saveTasks(list); }
}
// On boot: any task left 'running' was interrupted. Resume it once; if it is
// interrupted again, mark it abandoned and tell the owner what was left over.
// Pure resume decision (exported for tests): resume a running task once;
// a task already resumed once is marked abandoned. Mutates and returns via lists.
export function decideResume(list) {
  const toResume = [], abandoned = [];
  for (const task of list.filter((x) => x.status === 'running')) {
    if ((task.resumeCount || 0) < 1) { task.resumeCount = (task.resumeCount || 0) + 1; toResume.push(task); }
    else { task.status = 'abandoned'; task.finishedAt = Date.now(); abandoned.push(task); }
  }
  return { toResume, abandoned };
}

function initTaskResume() {
  const stale = loadTasks().filter((t) => t.status === 'running');
  if (!stale.length) return;
  const timer = setInterval(async () => {
    const s = getSock();
    if (!s) return;
    clearInterval(timer);
    await resumeInterruptedTasks(s);
  }, 15000);
  timer.unref?.();
}

export async function resumeInterruptedTasks(s) {
    const list = loadTasks();
    const { toResume, abandoned } = decideResume(list);
    saveTasks(list);
    for (const task of abandoned) {
      shell.audit('TASK ABANDONED id=' + task.id + ' goal="' + task.goal.slice(0, 120) + '"');
      await s.sendMessage(reportJid(task.by), { text: '⚠️ I could not finish a task even after retrying: "' + task.goal.slice(0, 120) + '". Ask me again if you still need it.' }).catch(() => {});
    }
    if (toResume.length) {
      shell.audit('TASK RESUME x' + toResume.length + ': ' + toResume.map((x) => x.goal.slice(0, 40)).join(' | '));
      const groups = new Map();
      for (const t of toResume) { const k = actorAllowed(t.by) ? (t.by || '') : ''; groups.set(k, [...(groups.get(k) || []), t]); }
      for (const [k, ts] of groups) await s.sendMessage(reportJid(k || undefined), { text: '🔁 I was interrupted mid-work. Resuming ' + ts.length + ' unfinished task(s) now:\n' + ts.map((x) => '- ' + x.goal.slice(0, 80)).join('\n') }).catch(() => {});
      for (const task of toResume) {
        const by = actorAllowed(task.by) ? task.by : undefined; // a revoked operator's task resumes as the owner's only if the owner never made it: skip it instead
        if (task.by && !by) { shell.audit('TASK RESUME SKIPPED id=' + task.id + ' (creator no longer an operator)'); continue; }
        const ctx = jobCtx(s, by, task.goal, 'AGENTRESUME');
        try { await shell.actorStore.run({ actor: shell.actorOf(ctx) }, () => runShellMode(ctx, task.goal, task.id, task.transcript)); }
        catch (e) { logger.warn('[agent] task resume failed: ' + (e?.message || 'error')); }
      }
    }
}

// ---- Health watch ---------------------------------------------------------
const HEARTBEAT = path.join('data', 'heartbeat');
let ramAlertedAt = 0;
function initHealthWatch() {
  let downSince = null;
  try {
    const prev = Number(fs.readFileSync(HEARTBEAT, 'utf8'));
    if (Date.now() - prev > 5 * 60e3) downSince = new Date(prev).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch { /* first ever boot */ }
  const beat = () => { try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(HEARTBEAT, String(Date.now())); } catch {} };
  beat();
  setInterval(beat, 120e3).unref?.();
  // wait for a live socket, then alert if we recovered from a gap; also watch RAM
  let bootAlertSent = false;
  setInterval(() => {
    const s = getSock();
    if (!s) return;
    if (downSince && !bootAlertSent) {
      bootAlertSent = true;
      shell.audit('HEALTH: was offline since ' + downSince + ', back now');
      s.sendMessage(ownerDM(), { text: '⚠️ I was offline since about ' + downSince + ' (IST). I am back now and everything is running.' }).catch(() => {});
    }
    const rss = process.memoryUsage().rss / 1048576;
    if (rss > 800 && Date.now() - ramAlertedAt > 6 * 3600e3) {
      ramAlertedAt = Date.now();
      shell.audit('HEALTH: RAM critical ' + Math.round(rss) + 'MB');
      s.sendMessage(ownerDM(), { text: '⚠️ Memory is critically high (' + Math.round(rss) + ' MB). If I slow down, say "/agent restart" or "/agent free memory".' }).catch(() => {});
    }
  }, 30e3).unref?.();
}

// boot-time arming (commands are imported at startup)
try { initSchedules(); } catch (e) { logger.warn('[agent] schedules init: ' + (e?.message || 'error')); }
try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(path.join('data', 'agent-boot'), String(Date.now())); } catch { /* best effort */ }
try { initHealthWatch(); } catch (e) { logger.warn('[agent] health init: ' + (e?.message || 'error')); }
try { agentqueue.initAgentQueue(); } catch (e) { logger.warn('[agent] queue init: ' + (e?.message || 'error')); }
try { initTaskResume(); } catch (e) { logger.warn('[agent] task-resume init: ' + (e?.message || 'error')); }

async function planRound(goal, transcript, jarvisCmds) {
  const prev = transcript.length ? null : loadSession();
  // Previous-task context only when the new instruction clearly refers to it;
  // a fresh topic must never be hijacked by an old pending question.
  const FOLLOWUP_RE = /\b(that|those|them|same|again|undo|also|and then|aur|usme|usmein|usi|woh|wohi|iska|uska|the file|the folder|the song|the list)\b/i;
  const prevForContext = prev && FOLLOWUP_RE.test(goal) ? prev : null;
  const history = (transcript.length
    ? '\n\nWork already done and its output:\n' + transcript.join('\n---\n').slice(-2500) +
      '\n\nIf the goal is achieved and the results look right, reply [{"done":"one-line verification"}]. Otherwise plan ONLY the next steps needed (fix or adapt if something failed).'
    : '') + (prevForContext
    ? '\n\nPrevious task (only for the follow-up references above): goal was "' + prevForContext.goal + '"; outcome: ' + prevForContext.summary
    : '');
  try {
    const r = await askAi(
      'You are Tab, a WhatsApp bot operating your own Linux server (Node.js app; code in src/, data in data/, cwd is the app root).\n' +
      'Owner instruction: ' + goal + '\n\n' + (replyStyle() ? 'Owner reply-style preference for summaries: ' + replyStyle() + '\n\n' : '') +
      'Carry it out step by step. Reply with ONLY a JSON array of at most ' + SH_STEPS + ' steps:\n' +
      '1. {"sh":"<one POSIX shell command run from the app root>"} - file work, code/config edits, disk/process checks, curl API lookups, npm, tar.\n' +
      '2. {"cmd":"<jarvis command name>","args":"<args>"} - run one of your own bot commands. Prefer this when a command fits. You may use ANY command, including owner and group-admin ones. Command index (Category(count): sample names; near-misses are auto-corrected): ' + jarvisCmds + '\n' +
      '3. {"bulk":{"cmd":"play","items":["<item>","<item>", ...]}} - bulk media delivery (2 or more items of the same kind; for large counts prefer ONE bulk step with all items). Each item is downloaded and delivered in this chat one by one, paced, with retries and its own progress. Use it for "download N songs/videos" goals: pick that artist\'s most popular tracks or the best matches yourself, matching the requested count exactly (for N items, produce N items).\n' +
      '4. {"send":{"to":"<phone digits only>","text":"<message>"}} - send a WhatsApp message from Tab\'s own number.\n' +
      '5. {"restart":true} - restart the bot (only when actually needed, e.g. after code edits).\n' +
      '6. {"panel":"status"} or {"panel":"logs"} - read your own hosting server (power state, RAM/CPU/disk, last console lines) through the panel API.' + (panelConfig().ok ? '' : ' (The panel is NOT configured on this host: PANEL_URL/PANEL_SERVER_ID/PANEL_API_KEY are missing in .env - say so if the owner asks for it.)') + '\n' +
      '   For a restart use {"restart":true} (it goes through the panel when configured). Never stop or kill the server, even if asked (that takes Tab fully offline; the owner can use ' + (config.prefix || '.') + 'panel stop himself).\n' +
      '7. {"schedule":{"cron":"<5-field cron>","goal":"<future instruction>"}} - set a recurring task (IST timezone). Use for "every night 2am" style requests.\n' +
      '8. {"search":"<web search query>"} - free web search (results come back to you); {"read":"<https URL or result:N>"} - read one public web page (result:N = the Nth result of your last search). Prefer these over curl for web lookups.\n' +
      'Bias to ACTION: when a sensible default exists, pick it and act - deliver in this chat, choose the most popular or obvious picks, never ask about folders, sources, formats or counts.\n' +
      'People write short, vague, incomplete messages. Infer the most likely meaning from context and common sense, ACT on it, and mention the assumption in your reply (e.g. "Assuming you meant X..."). Asking is the LAST resort.\n' +
      'Reply [{"ask":"one short question"}] ONLY when even a best guess is impossible (e.g. a bare "download song" or a single word like "love" with zero clues). Before asking, double-check there is really no reasonable default.\n' +
      'Never guess phone numbers or recipients - only message the owner or a number explicitly given in the instruction.\n' +
      'Group-admin commands (kick, ban, promote, mute, tagall...) run in the group where the instruction was given, or the group explicitly named in it.\n' +
      'If the instruction contains a link (YouTube, Instagram, TikTok, X/Twitter, Facebook, Spotify...), do not ask questions: pick the matching downloader command (ytmp4/ytmp3/play/instagram/tiktok/twitter/facebook/spotify or whichever fits the domain) with the URL as its args, so the file lands in this chat. If the platform has no downloader or the content is private/DRM-protected, say plainly why it cannot be downloaded instead of asking. If the owner names a platform and a topic but gives no URL (e.g. "couple videos from pinterest"), find matching content yourself - use a suitable Tab search/download command, or an sh step with yt-dlp (it supports \'ytsearch5:<query>\' and many site URLs) - and deliver the best matches. Never ask the owner for URLs.\n' +
      'Rules: never read or print .env, auth/ session files, or anything containing keys/tokens/passwords. Never attack, spam, or spy on other people.\n' +
      'A missing or nonexistent Tab command is NEVER a reason to refuse: if no command fits and no sensible default exists, ask one short question instead. Refuse only requests that are unsafe, illegal, or violate someone\'s privacy. If the request is impossible or unsafe, reply [{"refuse":"short reason"}].\n' +
      'If a step failed earlier, adapt - different args or a different command - never repeat a failed step verbatim.\n' +
      'Accuracy: report numbers in EXACTLY the units the owner asked for and convert carefully (1 byte = 8 bits, 1 MB = 8 megabits, 1 MiB = 8.3886 megabits); re-check the math before answering. The panel /resources "uptime" is the SERVER uptime, not the bot\'s - for bot uptime read data/agent-boot (epoch ms of the last bot start) and always label which uptime you mean.\n' +
      'Judge every instruction on its OWN intent - never answer a previous task\'s pending question when the instruction is a new topic.\n' +
      'Examples:\n' +
      '- "love" -> [{"ask":"Love what - a love quote, a romantic song, shayari?"}]\n' +
      '- If the request says "video" ("video song", "video songs", "videos", "mp4"), use the video command (MP4), not play. Use play only when the request asks for audio/mp3/songs without the word video.\n' +
    '- "download arijit singh love songs" -> [{"bulk":{"cmd":"play","items":["Tum Hi Ho","Channa Mereya","Agar Tum Saath Ho","Raabta","Ae Dil Hai Mushkil"]}}]\n' +
      '- "download 100 couple kissing videos from pinterest" -> [{"bulk":{"cmd":"pinterest","items":["couple kissing video","romantic couple kissing video","couple kissing hd video", ...]}}] - for pinterest VIDEO requests, end every item query with the word "video" (the downloader detects it); never use "album" for videos, albums are images.\n' +
    '- "download 20 couple memes from pinterest" -> [{"bulk":{"cmd":"pinterest","items":["album couple meme","album funny couple meme","album couple meme hindi","album cute couple meme","album couple meme quotes","album desi couple meme","album couple meme love"]}}] - for Pinterest use "album <query>" args (3 pins each) and vary the queries to reach the count.\n' +
      '- "how much ram is free" -> [{"sh":"free -m"}]\n' +
      '- "every night 2am cleanup" -> [{"schedule":{"cron":"0 2 * * *","goal":"clean old logs and temp files"}}]\n' +
      'For a single "download/play a song" goal, use one play command step. No other text.' + history,
      { allowKeyless: true, temperature: 0.1, prefer: 'groq' }, 'plan');
    const parsed = parseShellPlan(r?.text || r);
    if (!parsed) logger.warn('[agent] plan parse failed, raw: ' + String(r?.text || r || '').replace(/\s+/g, ' ').slice(0, 400));
    return parsed;
  } catch (e) {
    logger.warn('[agent] planner failed: ' + (e?.message || 'error'));
    return null;
  }
}

export async function execStep(ctx, step, results) {
  if (step.type === 'note') { results.push({ cmd: 'note', code: 0, out: step.text }); return; }
  if (step.type === 'tool') {
    try {
      const st = ctx.__toolState || { lastResults: [] }; // shared object: survives the per-step ctx copies
      const r = await runSafeStep({ ...ctx, isOwner: true }, step, st);
      results.push({ cmd: step.tool + ' ' + step.arg.slice(0, 80), code: r.ok ? 0 : 1, out: (r.finding ? r.finding.text : r.text).slice(0, 2500) });
    } catch (e) { results.push({ cmd: step.tool, code: 1, out: 'Failed: ' + (e?.message || 'error') }); }
    return;
  }
  if (step.type === 'panel') {
    try {
      if (!panelConfig().ok) { results.push({ cmd: 'panel ' + step.action, code: 1, out: 'The server panel is not configured (set PANEL_URL, PANEL_SERVER_ID and PANEL_API_KEY in .env).' }); return; }
      let out;
      if (step.action === 'logs') { let l = []; try { l = await getConsoleLogs({ lines: 30 }); } catch { /* fall back */ } if (!l.length) l = await localLogs(30); out = l.join('\n') || 'No log lines.'; }
      else out = formatStatus(await getStatus());
      shell.audit('PANEL ' + step.action);
      results.push({ cmd: 'panel ' + step.action, code: 0, out: panelRedact(shell.redact(out)).slice(0, 2500) });
    } catch (e) { results.push({ cmd: 'panel ' + step.action, code: 1, out: panelRedact(e?.message || 'panel error') }); }
    return;
  }
  if (step.type === 'schedule') {
    const list = loadSchedules();
    const entry = { id: Math.random().toString(36).slice(2, 8), cron: step.cron, goal: step.goal, createdAt: Date.now(), ...(ctx.operator ? { by: String(ctx.operator) } : {}) };
    if (scheduleOne(entry)) {
      list.push(entry); saveSchedules(list);
      shell.audit('SCHEDULE SET id=' + entry.id + ' cron="' + entry.cron + '" goal="' + entry.goal + '"');
      results.push({ cmd: 'schedule "' + step.goal.slice(0, 60) + '"', code: 0, out: 'Scheduled: ' + step.cron + ' (IST). It will run and report here. To cancel, say "/agent unschedule ' + entry.id + '".' });
    } else {
      results.push({ cmd: 'schedule', code: 1, out: 'Invalid cron "' + step.cron + '"' });
    }
    return;
  }
  if (step.type === 'send') {
    try {
      await ctx.sock.sendMessage(step.to + '@s.whatsapp.net', { text: step.text });
      logger.info('[agent] sent WhatsApp message to ' + step.to + ' (' + step.text.length + ' chars)');
      shell.audit('SEND to=' + step.to + ' text="' + step.text.slice(0, 200) + '"');
      results.push({ cmd: 'send message to ' + step.to, code: 0, out: 'Delivered: "' + step.text.slice(0, 120) + '"' });
    } catch (e) {
      results.push({ cmd: 'send message to ' + step.to, code: 1, out: 'Failed: ' + (e?.message || 'error') });
    }
    return;
  }
  if (step.type === 'bulk') {
    try {
      // Never queue fewer items than the owner explicitly listed as a clean 1..N list for a media goal (the planner can drop or merge some).
      const L = extractNumberedList(ctx.__goal);
      let note = '';
      if (L.clean && MEDIA_INTENT.test(String(ctx.__goal || '')) && L.items.length > step.items.length) { shell.audit('BULK LIST RESTORED planner=' + step.items.length + ' listed=' + L.items.length); step = { ...step, items: L.items.map((x) => x.slice(0, MAX_ARG)) }; note = ' (all ' + L.items.length + ' items you listed)'; }
      else if (L.markers >= 3 && !L.clean) { results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Not queued: your message has ' + L.markers + ' numbered markers but the numbering has gaps, repeats or empty items, so I cannot be sure every item is captured (the planner found ' + step.items.length + '). Nothing was started. Send the list numbered 1,2,3... in order, or one item per line.' }); return; }
      if (step.items.length > MAX_BULK) { results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Not queued: ' + step.items.length + ' items is over the ' + MAX_BULK + ' per request limit. Nothing was started; send it in parts of up to ' + MAX_BULK + ' (after the first part finishes).' }); return; }
      const pend = agentqueue.pendingCount();
      if (pend + step.items.length > MAX_PENDING) { results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Not queued: ' + pend + ' items are still pending and adding ' + step.items.length + ' would pass the ' + MAX_PENDING + ' pending limit. Nothing was started; wait for the queue to finish or say "/agent cancel downloading".' }); return; }
      const n = step.items.length;
      const qq = agentqueue.enqueue(ctx.jid, step.items.map((a) => ({ cmd: step.cmd, args: a })), ctx.__goal || 'bulk download');
      const tail = Array.isArray(qq?.items) ? qq.items.slice(-n) : [];
      if (tail.length !== n || tail.some((x, i) => x.args !== step.items[i])) { results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Queue check FAILED: asked to add ' + n + ' items but the queue file does not show exactly those items at its end. Do not resend; run "/agent status" to see what is queued.' }); return; }
      results.push({ cmd: 'bulk /' + step.cmd + ' x' + n, code: 0, out: 'Queued ' + n + ' downloads via /' + step.cmd + ' (verified in queue: ' + qq.items.length + ' items total, ' + n + ' added just now)' + note + '. Sending them to this chat one by one, each with retries - watch the separate progress message. Say "/agent retry" later to redo any that fail.' });
    } catch (e) {
      results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Failed to queue: ' + (e?.message || 'error') });
    }
    return;
  }
  if (step.type === 'cmd') {
    const cmd = registry.get(step.cmd);
    const cap = [];
    try {
      await cmd.run({ ...ctx, args: step.args ? step.args.split(/\s+/) : [], reply: async (t) => { cap.push(String(t).slice(0, 500)); return null; } });
      logger.info('[agent] ran /' + step.cmd + ' ' + step.args);
      shell.audit('CMD /' + step.cmd + ' ' + step.args);
      results.push({ cmd: '/' + step.cmd + (step.args ? ' ' + step.args : ''), code: 0, out: cap.join('\n').slice(0, 1500) || 'Done.' });
    } catch (e) {
      results.push({ cmd: '/' + step.cmd, code: 1, out: 'Failed: ' + (e?.message || 'error') });
    }
    return;
  }
  const r = await shell.execShell(step.sh, { signal: ctx.__signal });
  logger.info('[agent] shell: ' + step.sh.slice(0, 80) + ' -> ' + r.code);
  shell.audit('SHELL ' + step.sh + ' -> exit ' + r.code);
  results.push({ cmd: step.sh, ...r });
}

async function runUndo(ctx) {
  let files = [];
  try { files = fs.readdirSync('data').filter((f) => /^ops-backup-.*\.tar\.gz$/.test(f)).sort(); } catch {}
  if (!files.length) return ctx.reply('No backup found to undo to. Nothing has been changed through me yet.');
  const newest = 'data/' + files[files.length - 1];
  const preview = await shell.execShell('tar tzf ' + JSON.stringify(newest) + ' | head -15');
  shell.stage(['tar -xzf ' + JSON.stringify(newest)]);
  shell.audit('UNDO STAGED restore=' + newest);
  await ctx.reply('↩️ Undo: I will restore everything from backup ' + files[files.length - 1] + '. It contains:\n' + (preview.out || '(listing failed)') +
    '\nReply YES within 5 minutes to restore, or NO to cancel.');
}

async function runUnschedule(ctx, id) {
  const list = loadSchedules();
  const found = list.find((e) => e.id === id);
  if (!found) return ctx.reply('No scheduled task with id "' + id + '". Say "/agent schedules" to see them.');
  const task = schedJobs.get(id); if (task) { try { task.stop(); } catch {} schedJobs.delete(id); }
  saveSchedules(list.filter((e) => e.id !== id));
  shell.audit('UNSCHEDULE id=' + id + ' goal="' + found.goal.slice(0, 80) + '"');
  await ctx.reply('Removed the scheduled task "' + found.goal.slice(0, 80) + '" (' + found.cron + '). It will not run again.');
}

async function runListSchedules(ctx) {
  const list = loadSchedules();
  if (!list.length) return ctx.reply('No scheduled tasks set. Example: "/agent every night at 2am clean old logs".');
  await ctx.reply('Scheduled tasks:\n' + list.map((e) => '- [' + e.id + '] "' + (e.goal || e.topic || '').slice(0, 60) + '" at ' + e.cron + ' (IST)' + (e.active === false ? ' [PAUSED]' : '') + (e.kind === 'message' ? ' [news digest]' : '')).join('\n') + '\nManage: "/agent pause schedule <id>", "/agent resume schedule <id>", "/agent reschedule <id> to <new time>", "/agent unschedule <id>".');
}

async function runShellMode(ctx, goal, taskId, seedTranscript) {
  // Raw output on request
  if (/^(raw|raw output|exact output)$/i.test(goal)) {
    if (lastRaw && Date.now() - lastRaw.ts < 600e3) return ctx.reply('Exact output:\n' + lastRaw.text.slice(0, 3500));
    return ctx.reply('No recent output to show. Run something first.');
  }
  // Scheduled and resumed jobs get their own slot (they never collide with what the owner is doing); ".agent stop"
  // from the owner still stops them, because it stops every task in the chat.
  const liveTask = beginTask(taskKey(ctx.jid, ctx.sender) + (ctx.job ? '#' + ctx.job + Date.now() + Math.random().toString(36).slice(2, 6) : ''), goal);
  if (!liveTask) return ctx.reply('⏳ I am still working on your last task. Send ' + config.prefix + 'agent stop to cancel it, then try again.');
  const tid = taskId || taskStart(goal);
  try {
    return await runShellModeBody(ctx, goal, tid, seedTranscript, liveTask);
  } catch (e) {
    taskFinish(tid, 'failed', e?.message || 'error');
    logger.warn('[agent] task crashed: ' + (e?.stack || e?.message || 'error'));
    return ctx.reply('That task hit an internal error: ' + (e?.message || 'error') + '. Nothing was left half-applied.');
  } finally { endTask(liveTask); }
}

async function runShellModeBody(ctx, goal, tid, seedTranscript, liveTask = null) {
  ctx.__toolState = { lastResults: [] };
  const signal = liveTask?.controller?.signal;
  const started = Date.now();
  const capTotal = capMs('AGENT_OWNER_TASK_CAP_S', 900);
  let stoppedNote = null, planShown = false;
  ctx.__goal = goal;
  const prog = createProgressMessage(ctx, 'task', 20000);
  await prog.begin();
  const tick = setInterval(() => { try { prog.update({}); } catch {} }, 20000); tick.unref?.();
  const live = null; // the progress message owns the chat message now
  // Full registry, compact: every category with counts + sample names; names are fuzzy-resolved on use.
  const byCat = new Map();
  for (const c of registry.list()) {
    const k = c.category || 'Misc';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(c.name);
  }
  const jarvisCmds = [...byCat.entries()].sort().map(([k, v]) => k + '(' + v.length + '): ' + v.slice(0, 10).join(' ')).join('; ');
  const transcript = Array.isArray(seedTranscript) ? [...seedTranscript] : [], results = [];
  const stagedShells = [];
  let restartsPlanned = 0, finalNote = null, executed = 0;

  const goalNumbers = (goal.match(/\+?[0-9][0-9\s-]{6,16}[0-9]/g) || []).map((s) => s.replace(/\D/g, ''));
  const ownNumber = ctx.operator ? String(ctx.operator) : String(config.ownerNumber).replace(/\D/g, '');
  for (let round = 1; round <= 10 && executed < SH_EXEC_CAP; round++) {
    if (signal?.aborted) { stoppedNote = 'stopped'; break; }
    if (Date.now() - started >= capTotal) { stoppedNote = 'cap'; break; }
    let plan = null;
    try {
      plan = await withTimeout(planRound(goal, transcript, jarvisCmds), 120_000, signal);
    } catch (e) {
      if (e instanceof TaskCancelled) { stoppedNote = 'stopped'; break; }
      logger.warn('[agent] round ' + round + ' crashed: ' + (e?.stack || e?.message || 'error'));
      if (round === 1) finalNote = 'Something went wrong while planning. Try again in a moment.';
      break;
    }
    if (!plan && round === 1) {
      await new Promise((r) => setTimeout(r, 15000));
      try { plan = await withTimeout(planRound(goal, transcript, jarvisCmds), 120_000, signal); } catch (e) { plan = null; if (e instanceof TaskCancelled) { stoppedNote = 'stopped'; break; } }
    }
    if (!plan) { if (round === 1) finalNote = 'I could not plan that safely. Try rephrasing the instruction.'; break; }
    if (plan.refuse) { finalNote = 'I can\'t do that: ' + plan.refuse; break; }
    if (plan.ask) { finalNote = plan.ask; break; }
    if (plan.done) { logger.info('[agent] verified: ' + plan.done); break; }

    const runnable = [];
    let blocked = null;
    const goalWantsVideo = /\bvideos?\b|\bmp4\b/i.test(goal) && !/\b(audio|mp3)\b/i.test(goal);
    for (const step of plan.steps) {
      if (step.type === 'restart') { restartsPlanned++; continue; }
      if (step.type === 'panel') { runnable.push(screenPanelStep(step)); continue; }
      if (step.type === 'tool') { runnable.push(step); continue; }
      if (step.type === 'send') {
        if (step.to !== ownNumber && !goalNumbers.includes(step.to)) {
          runnable.push({ type: 'note', text: 'Skipped a message to ' + step.to + ' - I only message you, or a number you explicitly gave in the instruction.' });
          continue;
        }
        runnable.push(step); continue;
      }
      if (step.type === 'cmd') {
        const found = resolveCmd(step.cmd);
        if (!found) runnable.push({ type: 'note', text: 'The /' + step.cmd + ' command is not available, so that part was skipped.' });
        else if (found.name === 'panel' && !/^(status|info|logs?|console|help)?\b/i.test(step.args || '')) {
          runnable.push({ type: 'note', text: 'Refused: the agent only reads the server panel (status/logs); restart goes through a restart step, and stop/kill is yours to run with ' + (config.prefix || '.') + 'panel.' });
        } else {
          let name = found.name;
          if (name === 'play' && goalWantsVideo && resolveCmd('video')) name = 'video';
          runnable.push({ type: 'cmd', cmd: name, args: step.args });
        }
        continue;
      }
      if (step.type === 'bulk') {
        const found = resolveCmd(step.cmd);
        if (!found) runnable.push({ type: 'note', text: 'The /' + step.cmd + ' command is not available, so the bulk download was skipped.' });
        else {
          let name = found.name;
          if (name === 'play' && goalWantsVideo && resolveCmd('video')) name = 'video';
          runnable.push({ type: 'bulk', cmd: name, items: step.items });
        }
        continue;
      }
      if (/npm\s+run\s+start|node\s+(\.\/)?(src\/)?index\.js/.test(step.sh)) {
        runnable.push({ type: 'note', text: 'Skipped starting a second Tab process - it is already running. Use a restart step instead.' });
        continue;
      }
      if (/\/power\b/.test(step.sh) && /"signal"\s*:\s*"(stop|kill)"/.test(step.sh)) {
        runnable.push({ type: 'note', text: 'Refused: stopping or killing the server would take Tab fully offline - only restart is allowed.' });
        continue;
      }
      const cls = shell.classify(step.sh);
      if (cls === 'secret') { blocked = 'Stopped: one step would read secrets (.env/auth/keys). I never print those. Rephrase without touching secret files.'; break; }
      if (cls === 'refused') { blocked = 'I refuse that - it looks like an attack or privacy violation.'; break; }
      (cls === 'destructive' ? stagedShells : runnable).push(step);
    }
    if (blocked) { finalNote = blocked; break; }

    if (!runnable.length) {
      if (stagedShells.length || restartsPlanned) break; // staged or finishing with a restart
      if (round === 1) finalNote = 'Nothing to run for that.';
      break;
    }
    if (!planShown && round === 1 && runnable.length >= 2) {
      planShown = true;
      const lines = runnable.map((st, i) => (i + 1) + '. ' + ownerStepLabel(st));
      await ctx.reply('📋 Plan (' + runnable.length + ' steps):\n' + lines.join('\n') + (stagedShells.length ? '\n(+' + stagedShells.length + ' change(s) that will wait for your YES)' : '') + '\nSend ' + config.prefix + 'agent stop to cancel.').catch(() => {});
    }
    let si = 0;
    for (const step of runnable) {
      if (signal?.aborted) { stoppedNote = 'stopped'; break; }
      const leftMs = capTotal - (Date.now() - started);
      if (leftMs <= 0) { stoppedNote = 'cap'; break; }
      si++;
      const label = step.type === 'tool' ? step.tool + ': ' + step.arg.slice(0, 50) : step.type === 'panel' ? 'panel ' + step.action : step.type === 'cmd' ? '/' + step.cmd : step.type === 'bulk' ? 'queue bulk /' + step.cmd + ' x' + step.items.length : step.type === 'send' ? 'send message' : step.type === 'schedule' ? 'set schedule' : step.type === 'note' ? 'note' : String(step.sh || '').slice(0, 60);
      try { prog.update({ name: 'Step ' + (executed + 1) + ': ' + label, received: executed, total: executed + (runnable.length - si + 1) }); } catch {}
      let abandoned = false;
      const stepResults = []; // per step: a late push from an abandoned step never lands in this task's results
      const stepAc = new AbortController(); // kills a running shell step on stop or timeout
      const onTaskAbort = () => stepAc.abort();
      signal?.addEventListener?.('abort', onTaskAbort, { once: true });
      const sctx = mutedCtx(ctx, () => abandoned || !!signal?.aborted);
      sctx.__signal = stepAc.signal;
      try {
        await withTimeout(execStep(sctx, step, stepResults), Math.min(ownerStepTimeoutMs(step), leftMs), signal);
        results.push(...stepResults);
      } catch (e) {
        abandoned = true;
        stepAc.abort();
        if (e instanceof TaskCancelled) { stoppedNote = 'stopped'; results.push({ cmd: ownerStepLabel(step), code: 130, out: 'Stopped by the owner while running.' }); executed++; break; }
        if (e instanceof StepTimeout) results.push({ cmd: ownerStepLabel(step), code: 124, out: 'Step ' + e.message + ' and was abandoned (its chat output is muted).' });
        else {
          logger.warn('[agent] step crashed: ' + (e?.stack || e?.message || 'error'));
          results.push({ cmd: step.sh || step.cmd || step.type, code: 1, out: 'Step failed internally: ' + (e?.message || 'error') });
        }
      }
      signal?.removeEventListener?.('abort', onTaskAbort);
      executed++;
      transcript.push(results[results.length - 1].cmd + ' -> exit ' + results[results.length - 1].code + '\n' + results[results.length - 1].out);
      taskCheckpoint(tid, transcript);
    }
    if (stoppedNote) break;
    if (stagedShells.length || restartsPlanned) break; // confirm/restart before continuing
  }
  if (stoppedNote) { stagedShells.length = 0; restartsPlanned = 0; } // a stopped task never stages changes or restarts

  if (results.length) {
    lastRaw = { ts: Date.now(), text: results.map((r) => '$ ' + r.cmd + ' (exit ' + r.code + ')\n' + r.out).join('\n---\n') };
  }
  const rawForAi = results.map((r) => r.cmd + ' -> exit ' + r.code + (r.out ? '\n' + r.out : '')).join('\n');
  const bulkOnly = results.length > 0 && results.every((r) => r.code === 0 && /^bulk \//.test(r.cmd));
  if (stagedShells.length && !finalNote) finalNote = '';
  let text = finalNote || (bulkOnly ? results.map((r) => r.out).join('\n')
    : (results.length ? ((await summarize(rawForAi)) || fallbackSummary(results)) : (stagedShells.length ? 'Nothing has run yet.' : 'Nothing to run for that.')));
  if (stoppedNote) {
    const head = stoppedNote === 'stopped' ? '⏹️ Stopped by you after ' + executed + ' step(s).' : '⌛ Time limit (' + fmtSecs(capTotal) + ') reached after ' + executed + ' step(s); the rest was not started.';
    text = head + (results.length ? '\n\n' + text : '');
  } else if (executed >= 2 && !finalNote) text = '✅ Done: ' + executed + ' steps in ' + fmtSecs(Date.now() - started) + '.\n\n' + text;

  if (stagedShells.length && (stagedShells.some((s) => s.sh) || restartsPlanned > 0) && !(results.length === 0 && stagedShells.length === 0)) {
    const stagedCmds = stagedShells.map((s) => s.sh);
    shell.stage(stagedCmds, { restarts: restartsPlanned });
    shell.audit('STAGED shells=' + JSON.stringify(stagedCmds).slice(0, 300) + ' restarts=' + restartsPlanned);
    const info = shell.describeTargets(stagedCmds);
    const parts = [];
    parts.push(info.count > 0
      ? 'change/delete ' + info.count + ' item(s) on the server' + (info.bytes ? ' (about ' + fmtMB(info.bytes) + ')' : '')
      : 'make a system-level change (e.g. stopping a process)');
    if (restartsPlanned) parts.push('restart me (back in about a minute)');
    restartsPlanned = 0; // the restart now rides on the YES confirmation
    text += (text ? '\n\n' : '') + '⚠️ This will ' + parts.join(' and ') +
      '. A backup is taken automatically before anything runs.\nReply YES within 5 minutes to go ahead, or NO to cancel.';
  }
  clearInterval(tick);
  try { await prog.text(text); } catch { await ctx.reply(text); }
  saveSession(goal, text);
  taskFinish(tid, 'done', text.slice(0, 150));
  if (restartsPlanned) {
    shell.audit('AUTO RESTART after goal="' + goal.slice(0, 120) + '"');
    await ctx.reply('Restarting Tab now - back in about a minute.').catch(() => {});
    try {
      const { shutdown } = await import('../connection/whatsapp.js');
      restartBot({ shutdown, log: (m) => logger.warn(m) }).catch((e) => logger.warn('[agent] restart failed: ' + (e?.message || 'error')));
    } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  }
}

// ---- Safe mode (everyone): plan over read-only commands + tools (search, read, image, song, video, spotify).
export function parseSafePlan(raw) {
  const m = String(raw || '').match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    const steps = [];
    for (const s of arr.slice(0, MAX_STEPS)) {
      if (s?.answer) { steps.push({ answer: String(s.answer).slice(0, 800) }); continue; }
      if (s?.tool || (s && !s.cmd && Object.keys(s).some((k) => TOOLS[k.toLowerCase()]))) {
        const t = parseToolStep(s);
        if (!t) return null; // an unknown tool or a bad argument rejects the whole plan
        steps.push(t);
        continue;
      }
      const cmd = String(s?.cmd || '').toLowerCase().replace(/[^a-z]/g, '');
      const args = String(s?.args || '').slice(0, MAX_ARG).replace(/[\r\n]/g, ' ').trim();
      if (TOOLS[cmd]) { const t = parseToolStep({ tool: cmd, q: args, prompt: args, url: args }); if (!t) return null; steps.push(t); continue; }
      if (!SAFE.includes(cmd)) return null; // any unsafe/unknown step rejects the whole plan
      steps.push({ cmd, args });
    }
    return steps.length ? steps : null;
  } catch { return null; }
}

export function safePlannerPrompt(goal, available) {
  return 'Goal: ' + goal + '\n\n' +
    'Plan at most ' + MAX_STEPS + ' steps. Reply with ONLY a JSON array, no other text. Step types:\n' +
    '- {"cmd":"<command>","args":"<args>"} - run one of these bot commands (its reply goes straight to the user): ' + SAFE.join(', ') + '.\n' +
    '- {"search":"<web search query>"} - free web search for current facts, prices, news, people, events. The results come back to you and you write the final answer from them.\n' +
    '- {"read":"<https URL>"} - read one public web page the user gave. Use "result:1" (or result:2, result:3) to read that result of the previous search.\n' +
    '- {"image":"<English description>"} - generate one image.\n' +
    '- {"song":"<song name and artist, or a YouTube link>"} - send a song as audio.\n' +
    '- {"video":"<video name, or a YouTube link>"} - send a video.\n' +
    '- {"spotify":"<Spotify link, or song name>"} - send a song from a Spotify link.\n' +
    '- [{"answer":"one or two sentences"}] - when no step is needed (small talk, a simple fact you are sure of) or the goal cannot be done with these steps; say clearly what you can and cannot do.\n' +
    'Rules: prefer search for anything that may have changed recently. Keep the user\'s exact names and spellings in queries. ' +
    'Never invent URLs - read only URLs from the goal or "result:N". For Tab capabilities, these commands exist: ' + available + ' - mention relevant ones by name in an answer. Never invent shell commands.\n' +
    'Do not call functions; write the JSON array as plain text. Example: [{"search":"India vs Australia score today"},{"read":"result:1"}]';
}

/** A web page link the user gave that no step uses gets read first (planners sometimes search instead). Media links are left to the plan. */
export function ensureUrlsRead(goal, plan) {
  if (!plan) return plan;
  const urls = (String(goal).match(/https?:\/\/[^\s<>"']+/gi) || []).map((u) => u.replace(/[),.!?]+$/, '')).slice(0, 2);
  const used = (u) => plan.some((s) => String(s.arg || s.args || '').includes(u));
  const media = /youtu\.?be|spotify\.com|instagram\.com|tiktok\.com|facebook\.com|fb\.watch|twitter\.com|x\.com\/|pinterest\./i;
  const add = urls.filter((u) => !used(u) && !media.test(u)).map((u) => parseToolStep({ tool: 'read', url: u })).filter(Boolean);
  if (!add.length) return plan;
  return [...add, ...plan.filter((s) => !s.answer)].slice(0, MAX_STEPS);
}

const toolLabel = (s) => s.answer ? 'answer' : s.type === 'tool' ? TOOLS[s.tool].label + ': ' + s.arg.slice(0, 60) : config.prefix + s.cmd + (s.args ? ' ' + s.args : '');

/** Final answer from what search/read brought back. Falls back to the raw results when the AI is unavailable. */
export async function summarizeFindings(goal, findings, ask = ai) {
  const block = findings.map((f) => '[' + f.label + ']\n' + f.text).join('\n\n').slice(0, 9000);
  try {
    const r = await ask('User goal: ' + goal + '\n\nWhat I found:\n' + block + '\n\n' +
      'Write the answer for the user using ONLY what I found above. If it does not contain the answer, say so honestly. Talk to the user directly (never say "the results you provided"). ' +
      'At most 150 words, plain WhatsApp text (bold is *single asterisks*, no markdown headings). End with one line "Sources: " and the short domain names you used.',
    { allowKeyless: true, temperature: 0.2 }, 'agent-summary');
    const text = whatsappText(String(r?.text || ''));
    if (text) return text;
  } catch (e) { logger.warn('[agent] summary failed: ' + (e?.message || 'error')); }
  return findings.map((f) => '*' + f.label + '*\n' + f.text.slice(0, 900)).join('\n\n').slice(0, 3500);
}

/** Run one safe-mode step. Returns { ok, text, finding?, results? }. Media and cmd steps reply on their own. */
export async function runSafeStep(ctx, step, state, deps = {}) {
  const user = ctx.sender || ctx.senderJid || '?';
  const reg = deps.registry || registry;
  if (step.type === 'tool') {
    const quota = takeTool(user, step.tool, { isOwner: !!ctx.isOwner });
    if (!quota.ok) return { ok: false, text: 'Limit reached for ' + TOOLS[step.tool].label + ' (' + toolLimits()[step.tool] + ' per hour). Try again in about ' + quota.retryMin + ' min.' };
    if (step.tool === 'search') {
      const r = await (deps.runSearch || runSearch)(step.arg);
      state.lastResults = r.results || [];
      return { ok: r.ok, text: r.ok ? 'found ' + r.results.length + ' results' : r.text, finding: { label: 'Web search: ' + step.arg, text: r.text } };
    }
    if (step.tool === 'read') {
      let url = step.arg;
      const ref = /^result:(\d)$/i.exec(url);
      if (ref) {
        url = state.lastResults?.[Number(ref[1]) - 1]?.url;
        if (!url) return { ok: false, text: 'There was no search result #' + ref[1] + ' to read.' };
      }
      const r = await (deps.readUrl || readUrl)(url);
      return { ok: r.ok, text: r.ok ? 'read ' + shortUrlOf(r.finalUrl || url) : r.text, finding: r.ok ? { label: 'Page: ' + (r.title || shortUrlOf(url)) + ' (' + shortUrlOf(r.finalUrl || url) + ')', text: r.text } : null };
    }
    const cmd = reg.get(TOOLS[step.tool].cmd);
    if (!cmd) return { ok: false, text: config.prefix + TOOLS[step.tool].cmd + ' is not available right now.' };
    await cmd.run({ ...ctx, args: step.arg.split(/\s+/) });
    return { ok: true, text: 'sent' };
  }
  const cmd = reg.get(step.cmd);
  if (!cmd) return { ok: false, text: config.prefix + step.cmd + ' is unavailable right now.' };
  await cmd.run({ ...ctx, args: step.args ? step.args.split(/\s+/) : [] });
  return { ok: true, text: 'done' };
}
function shortUrlOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u || '').slice(0, 40); } }

/** Owner-mode step limits: shell 75 s (exec itself stops at 60 s), bot commands 5 min (downloads), the rest 30-45 s. */
export function ownerStepTimeoutMs(step) {
  return ({ sh: 75, cmd: 300, tool: 45, panel: 30, send: 30, schedule: 10, bulk: 30, note: 5 }[step.type] || 60) * 1000;
}
export function ownerStepLabel(step) {
  return step.type === 'tool' ? step.tool + ': ' + step.arg.slice(0, 50) : step.type === 'panel' ? 'panel ' + step.action : step.type === 'cmd' ? config.prefix + step.cmd + (step.args ? ' ' + step.args.slice(0, 40) : '') : step.type === 'bulk' ? 'queue ' + config.prefix + step.cmd + ' x' + step.items.length : step.type === 'send' ? 'send a message to ' + step.to : step.type === 'schedule' ? 'set a schedule' : step.type === 'note' ? 'note' : String(step.sh || '').slice(0, 60);
}
// Step time limits (item 7): web steps are quick, media downloads get longer. AGENT_TASK_CAP_S caps a whole task.
export function safeStepTimeoutMs(step) {
  if (step.type === 'tool') return { search: 30, read: 30, image: 120, song: 240, video: 240, spotify: 240 }[step.tool] * 1000;
  return 60_000;
}
const capMs = (envName, def) => Math.max(30, Number(process.env[envName]) || def) * 1000;

/** deps (tests only): ai, runStep, stepTimeoutMs, totalCapMs. */
export async function runSafeMode(ctx, goal, deps = {}) {
  const task = beginTask(taskKey(ctx.jid, ctx.sender), goal);
  if (!task) return ctx.reply('⏳ I am still working on your last ' + config.prefix + 'agent task. Send ' + config.prefix + 'agent stop to cancel it.');
  try { return await runSafeModeBody(ctx, goal, task, deps); } finally { endTask(task); }
}

async function runSafeModeBody(ctx, goal, task, deps = {}) {
  const signal = task.controller.signal;
  const live = await ctx.reply('🤖 Planning...').catch(() => null);
  const available = registry.list().map((c) => c.name).sort().slice(0, 80).join(', ');
  let plan = null;
  try {
    const r = await withTimeout((deps.ai || ai)(safePlannerPrompt(goal, available), { allowKeyless: true, temperature: 0.1 }, 'safe-plan'), 90_000, signal);
    plan = ensureUrlsRead(goal, parseSafePlan(r?.text || r));
  } catch (e) {
    if (e instanceof TaskCancelled) return editOrReply(ctx, live, '⏹️ Stopped before anything ran.');
    logger.warn('[agent] planner failed: ' + (e?.message || 'error'));
  }
  if (!plan) {
    return editOrReply(ctx, live, 'I could not make a safe plan for that. Try a simpler goal, or use a command directly (for example ' + config.prefix + 'ask, ' + config.prefix + 'play, ' + config.prefix + 'imagine).');
  }
  const answerStep = plan.find((s) => s.answer);
  if (answerStep && plan.every((s) => s.answer)) return editOrReply(ctx, live, answerStep.answer);
  const steps = plan.filter((s) => !s.answer);
  const title = '🤖 Plan (' + steps.length + ' step' + (steps.length > 1 ? 's' : '') + '):';
  const stopHint = 'Send ' + config.prefix + 'agent stop to cancel.';
  const edit = progressEditor(async (text) => { if (live?.key) await ctx.sock.sendMessage(ctx.jid, { text, edit: live.key }); });
  await editOrReply(ctx, live, renderPlan(title, steps.map((s) => ({ label: toolLabel(s), status: 'pending' })), { footer: stopHint }));
  const state = { lastResults: [] };
  const run = await runSteps({
    steps, ctx, signal, label: toolLabel,
    exec: (step, stepCtx) => (deps.runStep || runSafeStep)(stepCtx, step, state),
    stepTimeoutMs: deps.stepTimeoutMs || safeStepTimeoutMs,
    totalCapMs: deps.totalCapMs || capMs('AGENT_TASK_CAP_S', 300),
    onProgress: (rows, i) => edit(renderPlan('🤖 Working (' + (i + 1) + '/' + rows.length + '):', rows, { footer: stopHint })),
  });
  const done = run.rows.filter((r) => r.status === 'ok').length;
  const head = run.cancelled ? '⏹️ Stopped by you' : run.capped ? '⌛ Time limit reached' : done === steps.length ? '✅ Done' : '⚠️ Finished with problems';
  await edit(renderPlan(head + ' (' + done + '/' + steps.length + ' steps, ' + fmtSecs(run.ms) + '):', run.rows), { force: true });
  const findings = run.rows.map((r) => r.result?.finding).filter(Boolean);
  const problems = run.rows.map((r, i) => (['failed', 'timeout'].includes(r.status) ? '⚠️ Step ' + (i + 1) + ' (' + r.label + '): ' + (r.note || r.status) : '')).filter(Boolean);
  let final = findings.length && !run.cancelled ? await summarizeFindings(goal, findings, deps.ai || ai) : '';
  if (problems.length) final += (final ? '\n\n' : '') + problems.join('\n');
  if (steps.length > 1 || run.cancelled || run.capped) final = head + ' - ' + done + '/' + steps.length + ' steps in ' + fmtSecs(run.ms) + '.' + (final ? '\n\n' + final : '');
  if (final) await ctx.reply(final);
}


// ---- Auto-repair (guarded) --------------------------------------------------
const REPAIR_BUDGET_FILE = path.join('data', 'repair-budget.json');
const REPAIR_CURSOR_FILE = path.join('data', 'repair-cursor.json');
function loadJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function saveJson(f, v) { try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); } catch { /* best effort */ } }
function repairBudgetOk(name) {
  const b = loadJson(REPAIR_BUDGET_FILE, {});
  return Date.now() - (b[name] || 0) > 24 * 3600e3;
}
function repairBudgetUse(name) {
  const b = loadJson(REPAIR_BUDGET_FILE, {});
  b[name] = Date.now();
  saveJson(REPAIR_BUDGET_FILE, b);
}

/** Rewrite a generated command to fix a runtime error. Same gates as install:
 *  safety scan, node --check. STATIC-ONLY: rewritten bodies are never executed here. */
export async function repairCommand(name, errMsg, { apply = true } = {}) {
  const entry = getGenerated(name);
  if (!entry) return { ok: false, why: '/' + name + ' was not generated by me, so I will not rewrite it automatically.' };
  const file = path.join('src', 'commands', name + '.js');
  let code;
  try { code = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, why: 'the command file is missing' }; }
  if (/rm\s+-rf|kill\s+-9|\bkillall\b|unlinkSync|rmSync|execSync|child_process/.test(code)) {
    return { ok: false, why: '/' + name + ' can delete or change things, so I will not rewrite it automatically.' };
  }
  const prompt = 'A WhatsApp bot command named "/' + name + '" fails at runtime with this error: ' + String(errMsg).slice(0, 200) +
    '\nHere is its full current code:\n' + code.slice(0, 6000) +
    '\nRewrite ONLY the JavaScript statements that go INSIDE an async run(ctx) {} function, fixing the error while keeping the same purpose. ' + CODEGEN_RULES;
  let body = null; let lastFail = '';
  for (let attempt = 1; attempt <= 3 && !body; attempt++) {
    let b = '';
    try {
      const r = await ai(prompt + (lastFail ? '\nYour previous attempt was rejected because ' + lastFail + '. Output corrected statements only.' : ''), { temperature: 0.3 }, 'repair');
      b = r && r.text ? r.text : '';
    } catch (e) { lastFail = 'the AI call failed (' + (e?.message || 'error') + ')'; continue; }
    b = String(b || '').trim().replace(/^```(?:js|javascript)?\s*/im, '').replace(/```\s*$/, '').trim();
    const prob = bodyProblem(b);
    if (prob) { lastFail = prob; continue; }
    body = b;
  }
  if (!body) return { ok: false, why: 'could not generate a fix (' + lastFail.slice(0, 100) + ')' };
  const candidate = buildCommandFile(name, { desc: (entry.pkg || name) + ' helper', usage: entry.usage || '<input>', minArgs: entry.minArgs ?? 1, body });
  const gv2 = validateGeneratedSource(candidate, body);
  if (!gv2.ok) return { ok: false, why: 'the fix failed the structural gate (' + gv2.why.slice(0, 80) + ')' };
  const chkFile = path.join('src', 'commands', '_chk-repair-' + name + '.mjs');
  try {
    fs.writeFileSync(chkFile, candidate);
    const chk = await shell.execShell('node --check ' + JSON.stringify(chkFile), { timeoutMs: 30000 });
    if (chk.code !== 0) return { ok: false, why: 'the fix had a syntax error' };
  } finally { try { fs.unlinkSync(chkFile); } catch {} }
  // STATIC-ONLY: safety scan + syntax check above; the rewritten body is never
  // imported or executed here. Honestly marked unverified - the owner review
  // gate (staged YES) decides whether it goes live.
  const repairNote = ' (static checks only - functional behavior unverified)';
  if (!apply) return { ok: true, applied: false, body };
  archiveVersion(name);
  fs.writeFileSync(file, candidate);
  noteGenerated(name, { repairs: (entry.repairs || 0) + 1, lastError: String(errMsg).slice(0, 200) });
  // hot-swap the live registration so no restart is needed
  try {
    const mod = await import('./' + name + '.js?t=' + Date.now());
    registry.register(mod.default);
  } catch (e) {
    return { ok: false, why: 'fix written but reload failed (' + String(e?.message || e).slice(0, 80) + ') - a restart will load it' };
  }
  shell.audit('REPAIR /' + name + ' fixed err="' + String(errMsg).slice(0, 80) + '" (repair #' + ((entry.repairs || 0) + 1) + ')' + repairNote);
  return { ok: true, applied: true, note: repairNote };
}

export async function runRepairConfirmed(ctx, p) {
  const { name, body } = p.repaircmd || {};
  const entry = name && getGenerated(name);
  if (!entry) return ctx.reply('That prepared repair is no longer valid (the command is gone) - nothing was applied.');
  if (bodyProblem(body)) return ctx.reply('The prepared fix no longer passes the safety scan - nothing was applied.');
  const candidate = buildCommandFile(name, { desc: (entry.pkg || name) + ' helper', usage: entry.usage || '<input>', minArgs: entry.minArgs ?? 1, body });
  const gv3 = validateGeneratedSource(candidate, body);
  if (!gv3.ok) return ctx.reply('The prepared fix no longer passes the structural gate (' + gv3.why.slice(0, 80) + ') - nothing was applied.');
  const chkFile = path.join('src', 'commands', '_chk-repair-' + name + '.mjs');
  try {
    fs.writeFileSync(chkFile, candidate);
    const chk = await shell.execShell('node --check ' + JSON.stringify(chkFile), { timeoutMs: 30000 });
    if (chk.code !== 0) return ctx.reply('The prepared fix no longer passes its syntax check - nothing was applied.');
  } finally { try { fs.unlinkSync(chkFile); } catch {} }
  const file = path.join('src', 'commands', name + '.js');
  archiveVersion(name);
  fs.writeFileSync(file, candidate);
  noteGenerated(name, { repairs: (entry.repairs || 0) + 1 });
  try {
    const mod = await import('./' + name + '.js?t=' + Date.now());
    registry.register(mod.default);
  } catch (e) {
    return ctx.reply('Fix written but reload failed (' + String(e?.message || e).slice(0, 80) + ') - a restart will load it.');
  }
  shell.audit('REPAIR-CONFIRMED /' + name + ' (owner YES)');
  return ctx.reply('🔧 Repaired /' + name + ' and it is live now. Rollback: "/agent history ' + name + '".');
}

async function runRepairRoute(ctx, name) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (!name) return ctx.reply('Say e.g. "/agent repair zenbotscraper".');
  if (!getGenerated(name)) return ctx.reply('/' + name + ' is not a command I generated, so I will not rewrite it.');
  await ctx.reply('Diagnosing /' + name + ' and preparing a repair (safety scan + syntax check; nothing goes live without your YES)...');
  const fails = readFailures(Date.now() - 7 * 24 * 3600e3).filter((f) => f.cmd === name);
  const lastErr = fails.length ? fails[fails.length - 1].err : 'owner-requested repair (no recent logged error)';
  const r = await repairCommand(name, lastErr, { apply: false });
  if (r.ok) {
    shell.stage([], { kind: 'repaircmd', repaircmd: { name, body: r.body } });
    shell.audit('REPAIR STAGED /' + name + ' (owner route)');
    return ctx.reply('🔧 Repair PREPARED for /' + name + ' (last error: ' + lastErr.slice(0, 100) + ').\nWhat the fixed command does when used: ' + effectsSummary(r.body) + '\nThe fix is AI-written and passed static checks only (safety scan + syntax) - its functional behavior is UNVERIFIED until it runs. Reply YES within 5 minutes to apply it, or NO to discard. Rollback after applying: "/agent restore cmd ' + name + ' 1".');
  }
  return ctx.reply('I could not repair /' + name + ': ' + r.why + ' Nothing was changed. (Rollback options: "/agent history ' + name + '".)');
}

export async function repairWatchTick() {
    const cursor = loadJson(REPAIR_CURSOR_FILE, { ts: Date.now() });
    const fails = readFailures(cursor.ts);
    saveJson(REPAIR_CURSOR_FILE, { ts: Date.now() });
    if (!fails.length) return;
    const s = getSock();
    if (!s) return;
    const seen = new Set();
    for (const f of fails) {
      if (seen.has(f.cmd)) continue;
      seen.add(f.cmd);
      if (!getGenerated(f.cmd) || !repairBudgetOk(f.cmd)) continue;
      repairBudgetUse(f.cmd);
      shell.audit('REPAIR auto attempt /' + f.cmd + ' err="' + f.err.slice(0, 80) + '"');
      const r = await repairCommand(f.cmd, f.err, { apply: false });
      if (r.ok) {
        shell.stage([], { kind: 'repaircmd', repaircmd: { name: f.cmd, body: r.body } });
        await s.sendMessage(ownerDM(), { text: '🔧 Auto-repair PREPARED for /' + f.cmd + ' (was failing: "' + f.err.slice(0, 100) + '").\nWhat the fixed command does when used: ' + effectsSummary(r.body) + '\nThe fix is AI-written; it passed static checks only (safety scan + syntax - its functional behavior is UNVERIFIED), and any external service it uses can still fail. Reply YES within 5 minutes to apply it, or NO to discard. I will not auto-prepare another fix for this command today.' }).catch(() => {});
      } else {
        await s.sendMessage(ownerDM(), { text: '🔧 Auto-repair: /' + f.cmd + ' failed but I could not fix it automatically (' + r.why.slice(0, 150) + '). Original error: ' + f.err.slice(0, 100) }).catch(() => {});
      }
    }
}

function initRepairWatch() {
  const t = setInterval(() => { repairWatchTick().catch((e) => logger.warn('[agent] repair watch: ' + (e?.message || 'error'))); }, 90e3);
  t.unref?.();
}
try { initRepairWatch(); } catch (e) { logger.warn('[agent] repair-watch init: ' + (e?.message || 'error')); }


// ---- Status routes: health, quota, permissions, history -------------------
function riskLabel(code) {
  if (/rm\s+-rf|unlinkSync|rmSync|execSync|child_process|\bkill\b/.test(code)) return 'destructive-ish';
  if (/writeFileSync|fs\.write|appendFileSync/.test(code)) return 'filesystem';
  if (/fetch\(|https?\.get|axios|await import\(/.test(code)) return 'network';
  return 'local';
}

export async function runHealth(ctx) {
  const fails = readFailures(Date.now() - 7 * 24 * 3600e3);
  const byCmd = {};
  for (const f of fails) byCmd[f.cmd] = (byCmd[f.cmd] || 0) + 1;
  const top = Object.entries(byCmd).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const gen = loadGenerated();
  const rss = Math.round(process.memoryUsage().rss / 1048576);
  let boot = 'unknown';
  try { boot = new Date(Number(fs.readFileSync(path.join('data', 'agent-boot'), 'utf8'))).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); } catch { /* unknown */ }
  const lines = [
    '🩺 Health (last 7 days)',
    '- Generated commands: ' + gen.length + ' (' + gen.filter((g) => (g.repairs || 0) > 0).length + ' repaired at least once)',
    '- Commands failing: ' + Object.keys(byCmd).length + ' (' + fails.length + ' failures total)',
    '- RAM now: ' + rss + ' MB | last bot start: ' + boot + ' (IST)',
    '- AI line-up: ' + aiLineup(),
  ];
  if (top.length) {
    lines.push('Top failing:');
    for (const [name, n] of top) {
      const isGen = !!getGenerated(name);
      lines.push('- /' + name + ': ' + n + 'x' + (isGen ? ' - fix: "/agent repair ' + name + '"' : ' (not generated by me - no auto-fix)'));
    }
  } else {
    lines.push('No failures logged in the last 7 days.');
  }
  await ctx.reply(lines.join('\n'));
}

export async function runQuota(ctx) {
  const q = loadJson(QUOTA_FILE, null);
  if (!q || !q.day) return ctx.reply('No /agent AI calls recorded today yet.');
  const feats = Object.entries(q.byFeature || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ': ' + v).join(', ');
  await ctx.reply('Today\'s /agent AI usage (my own counters, estimates only - the providers\' real quotas live on their side):\n- Calls: ' + q.calls + '\n- Failed calls: ' + (q.failures || 0) + '\n- By feature: ' + (feats || 'none') + '\nAI line-up: ' + aiLineup() + '\nFree-tier providers apply their own daily limits; when one runs out (429) the next one in the line-up answers.');
}

export async function runPermissions(ctx) {
  const gen = loadGenerated();
  if (!gen.length) return ctx.reply('No generated commands yet.');
  const flags = loadJson(path.join('data', 'command-flags.json'), { disabled: [] });
  const lines = ['Generated command permissions (risk labels are a static guess, approximate):'];
  for (const g of gen) {
    let code = '';
    try { code = fs.readFileSync(path.join('src', 'commands', g.name + '.js'), 'utf8'); } catch { /* missing */ }
    const state = (flags.disabled || []).includes(g.name) ? 'DISABLED' : 'enabled';
    lines.push('- /' + g.name + ': ' + riskLabel(code) + ', ' + state + (g.pkg ? ' (pkg ' + g.pkg + ')' : g.apiUrl ? ' (API)' : ''));
  }
  lines.push('Toggle with "/agent disable cmd <name>" or "/agent enable cmd <name>".');
  await ctx.reply(lines.join('\n'));
}

export async function runCmdToggle(ctx, action, name) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (!registry.get(name)) return ctx.reply('No command called /' + name + '.');
  const f = path.join('data', 'command-flags.json');
  const flags = loadJson(f, { disabled: [] });
  flags.disabled = flags.disabled || [];
  if (action.toLowerCase() === 'disable') {
    if (!flags.disabled.includes(name)) flags.disabled.push(name);
  } else {
    flags.disabled = flags.disabled.filter((x) => x !== name);
  }
  saveJson(f, flags);
  shell.audit('CMD ' + action.toUpperCase() + ' /' + name);
  await ctx.reply('/' + name + ' is now ' + (action.toLowerCase() === 'disable' ? 'DISABLED (everyone, until you enable it)' : 'enabled again') + '.');
}

export async function runHistory(ctx, name) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const versions = listVersions(name);
  if (!versions.length) return ctx.reply('No saved versions for /' + name + '.');
  const lines = ['Saved versions of /' + name + ' (newest first):'];
  const recent = versions.slice(-5).reverse();
  recent.forEach((v, i) => {
    let size = 0;
    try { size = fs.statSync(versionPath(name, v)).size; } catch { /* unknown */ }
    lines.push((i + 1) + '. ' + v.replace('.js', '').replace('T', ' ').slice(0, 19) + ' UTC (' + size + ' bytes)');
  });
  lines.push('See changes: "/agent diff ' + name + ' <n>". Restore: "/agent restore cmd ' + name + ' <n>".');
  await ctx.reply(lines.join('\n'));
}

export async function runDiff(ctx, name, n) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const versions = listVersions(name);
  const recent = versions.slice(-5).reverse();
  const pick = recent[n - 1];
  if (!pick) return ctx.reply('No version ' + n + ' for /' + name + '. Say "/agent history ' + name + '".');
  const vp = versionPath(name, pick);
  const cur = path.join('src', 'commands', name + '.js');
  if (!fs.existsSync(cur)) return ctx.reply('/' + name + ' is not currently installed.');
  const r = await shell.execShell('diff -u ' + JSON.stringify(vp) + ' ' + JSON.stringify(cur) + ' | head -80', { timeoutMs: 15000 });
  await ctx.reply('Diff of /' + name + ': version ' + n + ' vs current (--- old, +++ current):\n' + (r.out || '(identical)' || '').slice(0, 3000));
}

export async function runRestoreCmd(ctx, name, n) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const versions = listVersions(name);
  const pick = versions.slice(-5).reverse()[n - 1];
  if (!pick) return ctx.reply('No version ' + n + ' for /' + name + '. Say "/agent history ' + name + '".');
  shell.stage([], { kind: 'restorecmd', restorecmd: { name, file: versionPath(name, pick) } });
  shell.audit('RESTORE CMD STAGED /' + name + ' version ' + n);
  await ctx.reply('Restore /' + name + ' to version ' + n + ' (' + pick.replace('.js', '') + ')? The current version is archived first. Reply YES within 5 minutes to go ahead, or NO to cancel.');
}

export async function runRestoreCmdConfirmed(ctx, p) {
  const { name, file } = p.restorecmd;
  try {
    archiveVersion(name);
    fs.copyFileSync(file, path.join('src', 'commands', name + '.js'));
    const mod = await import('./' + name + '.js?t=' + Date.now());
    registry.register(mod.default);
    shell.audit('RESTORE CMD /' + name + ' <- ' + path.basename(file));
    return ctx.reply('/' + name + ' restored to the archived version and is live now.');
  } catch (e) {
    return ctx.reply('Restore failed: ' + String(e?.message || e).slice(0, 150) + '. Nothing else changed.');
  }
}

// ---- Reply style (applies to /agent conversational replies only) ----------
const STYLE_FILE = path.join('data', 'reply-style.json');
function replyStyle() {
  const s = loadJson(STYLE_FILE, null);
  return s && s.style ? s.style : '';
}
export async function runReplyStyle(ctx, text) {
  const style = String(text || '').slice(0, 150).trim();
  if (/^(default|reset)$/i.test(style)) {
    saveJson(STYLE_FILE, {});
    return ctx.reply('Reply style reset to default.');
  }
  saveJson(STYLE_FILE, { style, setAt: Date.now() });
  shell.audit('REPLY STYLE set: ' + style.slice(0, 80));
  await ctx.reply('Got it - my /agent replies will follow: "' + style + '". (Bot command replies stay in English as before.)');
}

// ---- Automations: pause/resume/reschedule + live-source message jobs ------
async function runPauseSchedule(ctx, action, id) {
  const list = loadSchedules();
  const e = list.find((x) => x.id === id);
  if (!e) return ctx.reply('No scheduled task with id "' + id + '". Say "/agent schedules" to see them.');
  if (action.toLowerCase() === 'pause') {
    e.active = false;
    const t = schedJobs.get(id); if (t) { try { t.stop(); } catch {} schedJobs.delete(id); }
  } else {
    e.active = true;
    if (!schedJobs.has(id)) scheduleOne(e);
  }
  saveSchedules(list);
  shell.audit('SCHEDULE ' + action.toUpperCase() + ' id=' + id);
  await ctx.reply('Scheduled task [' + id + '] "' + (e.goal || e.topic || '').slice(0, 60) + '" is now ' + (e.active ? 'RUNNING again' : 'PAUSED (kept, will not fire)') + '.');
}

async function runReschedule(ctx, id, whenText) {
  const list = loadSchedules();
  const e = list.find((x) => x.id === id);
  if (!e) return ctx.reply('No scheduled task with id "' + id + '". Say "/agent schedules" to see them.');
  const r = await ai('Convert this time description to a 5-field cron expression (Asia/Kolkata). Reply with ONLY the cron fields, nothing else. Time: ' + String(whenText).slice(0, 100), { temperature: 0 }, 'schedule');
  const c = String(r && r.text || '').trim().split('\n')[0].trim();
  if (!cron.validate(c)) return ctx.reply('I could not turn "' + whenText + '" into a schedule. Try e.g. "/agent reschedule ' + id + ' to every day 8am".');
  e.cron = c;
  const t = schedJobs.get(id); if (t) { try { t.stop(); } catch {} schedJobs.delete(id); }
  if (e.active !== false) scheduleOne(e);
  saveSchedules(list);
  shell.audit('SCHEDULE RESCHEDULED id=' + id + ' cron="' + c + '"');
  await ctx.reply('Scheduled task [' + id + '] now runs at "' + c + '" (IST)' + (e.active === false ? ' once you resume it' : '') + '.');
}

async function fetchNewsItems(topic) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(topic) + '&hl=en-IN&gl=IN&ceid=IN:en';
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('news feed returned HTTP ' + r.status);
  const xml = await r.text();
  const clean = (x) => String(x || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map((m) => ({
    title: clean((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
    link: clean((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
  })).filter((x) => x.title);
  if (!items.length) throw new Error('no live news items found for "' + topic + '"');
  return items;
}

export async function runMessageJob(entry) {
  const s = getSock();
  if (!s) return;
  shell.audit('MSGJOB fired id=' + entry.id + ' topic="' + entry.topic + '"');
  try {
    const items = await fetchNewsItems(entry.topic);
    const r = await ai('Summarize these LIVE news headlines about "' + entry.topic + '" into a short WhatsApp digest (max 6 lines, plain English, keep each link with its headline):\n' + items.map((x, i) => (i + 1) + '. ' + x.title + ' ' + x.link).join('\n'), { temperature: 0.3 }, 'msgjob');
    const text = String(r && r.text || '').trim() || items.map((x) => '- ' + x.title + '\n' + x.link).join('\n');
    await s.sendMessage(reportJid(entry.by), { text: '📰 ' + entry.topic + ' update (live sources):\n' + text.slice(0, 2000) });
  } catch (e) {
    await s.sendMessage(reportJid(entry.by), { text: '📰 Your scheduled "' + entry.topic + '" update could not run: ' + String(e?.message || e).slice(0, 150) + '. I will try again at the next scheduled time.' }).catch(() => {});
  }
}

function isMessageJobGoal(goal) {
  return /(every|har\s|roz)\b[\s\S]*(send me|bhejo|news|updates?)/i.test(goal) && !/clean|delete|restart|update all/i.test(goal);
}

async function runMessageJobFlow(ctx, goal) {
  const r = await ai('Extract a recurring WhatsApp news-update job from this request. Reply with ONLY JSON: {"cron":"<5-field cron, Asia/Kolkata>","topic":"<news topic in English, 1-4 words>"}. Request: ' + goal.slice(0, 200), { temperature: 0 }, 'schedule');
  let spec = null;
  try { spec = JSON.parse(String(r && r.text || '').replace(/```json|```/g, '').trim()); } catch { /* parse fail */ }
  if (!spec || !spec.cron || !spec.topic || !cron.validate(String(spec.cron).trim())) {
    return ctx.reply('I could not turn that into a scheduled update. Example: "/agent every day 8am send me tech news".');
  }
  spec.cron = String(spec.cron).trim();
  spec.topic = String(spec.topic).slice(0, 60);
  shell.stage([], { kind: 'msgjob', msgjob: spec });
  shell.audit('MSGJOB STAGED cron="' + spec.cron + '" topic="' + spec.topic + '"');
  await ctx.reply('Plan: every "' + spec.cron + '" (IST) I will fetch LIVE news about "' + spec.topic + '" and send you a short digest. Note: it uses a live news feed - if the feed is unreachable I will say so instead of inventing news. Reply YES within 5 minutes to set it, or NO to cancel.');
}

async function runMessageJobConfirmed(ctx, p) {
  const spec = p.msgjob;
  const list = loadSchedules();
  const entry = { id: Math.random().toString(36).slice(2, 8), kind: 'message', cron: spec.cron, topic: spec.topic, goal: 'news update: ' + spec.topic, active: true, createdAt: Date.now(), ...(ctx.operator ? { by: String(ctx.operator) } : {}) };
  if (!scheduleOne(entry)) return ctx.reply('That schedule was invalid - nothing was set.');
  list.push(entry); saveSchedules(list);
  shell.audit('MSGJOB SET id=' + entry.id + ' cron="' + entry.cron + '" topic="' + entry.topic + '"');
  await ctx.reply('Set [' + entry.id + ']: live "' + entry.topic + '" digest at ' + entry.cron + ' (IST). Manage: "/agent schedules", "/agent pause schedule ' + entry.id + '", "/agent reschedule ' + entry.id + ' to <new time>", "/agent unschedule ' + entry.id + '".');
  return true;
}

// ---- Feature-builder: requirement-first command creation ------------------
function isBuilderGoal(goal) {
  return /(command|cmd|tool)s?\s*(banao|bana\s*do|banado|bna\s*do)/i.test(goal)
    || /^(make|build|create)\s+(a\s+|an\s+|me\s+a\s+)?[\w\s-]{2,60}(command|tool)$/i.test(goal);
}
function builderCmdName(goal, fallback) {
  const m = goal.match(/\b(?:called|named|naam)\s+\/?([a-z0-9]{3,15})\b/i);
  let name = (m ? m[1] : fallback || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
  if (name.length < 3) name = '';
  return name;
}

async function runBuilderFlow(ctx, goal) {
  // 1) pre-tested template first - no LLM, no quota
  const tpl = pickTemplate(goal);
  if (tpl) {
    let name = builderCmdName(goal, tpl.key);
    if (!name) name = tpl.key;
    if (registry.get(name)) {
      const alt = (name + '2').slice(0, 15);
      if (registry.get(alt)) return ctx.reply('/' + name + ' and /' + alt + ' already exist - say e.g. "make a ' + tpl.key + ' command called ' + tpl.key + 'x".');
      name = alt;
    }
    shell.stage([], { kind: 'template', template: { key: tpl.key, cmdName: name, desc: tpl.desc, usage: tpl.usage || '<input>', minArgs: tpl.minArgs ?? 1 } });
    shell.audit('TEMPLATE STAGED ' + tpl.key + ' as /' + name);
    return ctx.reply('Plan: add /' + name + ' from a pre-tested template (' + tpl.desc + '). No AI code writing needed for this one.\nWhat it does when used: ' + effectsSummary(tpl.body) + '\nReply YES within 5 minutes to add it, or NO to cancel.');
  }
  // 2) LLM maps the requirement to a real package or a keyless free API
  const r = await ai('A WhatsApp bot owner wants a new command: "' + goal.slice(0, 200) + '".\nDecide the implementation. Reply with ONLY JSON:\n{"package":"<one real npm package name>","cmdName":"<3-15 lowercase letters>"} if an npm package fits best,\n{"api":"<one keyless free https GET endpoint>","cmdName":"<3-15 lowercase letters>","how":"<one line>"} if a keyless free public API fits best,\n{"unknown":"<one line why>"} if it needs a paid/keyed service or you are not sure. Never invent package names or URLs.', { temperature: 0.2 }, 'builder');
  let spec = null;
  try { spec = JSON.parse(String(r && r.text || '').replace(/```json|```/g, '').trim()); } catch { /* parse fail */ }
  if (!spec) return ctx.reply('I could not plan that command. Try naming the npm package directly, e.g. "/agent install <package>".');
  if (spec.unknown) return ctx.reply('I cannot build that reliably: ' + String(spec.unknown).slice(0, 200) + ' If you know a specific free npm package or keyless API for it, name it and I will use that.');
  const name = builderCmdName(goal, spec.cmdName) || String(spec.cmdName || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
  if (!name || name.length < 3) return ctx.reply('I need a short command name. Say e.g. "... called mytool".');
  if (registry.get(name)) return ctx.reply('/' + name + ' already exists - pick another name ("... called ' + name + 'x").');
  if (spec.package) {
    const pkg = String(spec.package).trim();
    const meta = await npmMeta(pkg);
    if (meta.exists === null) return ctx.reply('The npm registry could not be reached just now - try again in a moment.');
    if (!meta.exists) return ctx.reply('The AI suggested npm package "' + pkg + '" but it does not exist on the registry. Rephrase or name a real package.');
    shell.stage([], { kind: 'install', install: { pkg, version: meta.version, cmdName: name, desc: String(meta.description || '').slice(0, 150), finalFile: path.join('src', 'commands', name + '.js') } });
    shell.audit('BUILDER->INSTALL STAGED ' + pkg + ' as /' + name);
    return ctx.reply('Plan: install ' + pkg + ' v' + meta.version + ' and build /' + name + ' on it (' + String(meta.description || 'no description').slice(0, 120) + '). Self-test, then live. Reply YES within 5 minutes to go ahead, or NO to cancel.');
  }
  if (spec.api) {
    const url = String(spec.api).trim();
    if (!/^https:\/\//i.test(url)) return ctx.reply('The suggested API is not a plain https GET endpoint - I will not use it.');
    let probe = null;
    try {
      const pr = await fetchPublic(url, { timeoutMs: 15000 });
      probe = { ok: pr.status >= 200 && pr.status < 300, status: pr.status };
    } catch (e) { probe = { ok: false, status: String(e?.message || e).slice(0, 80) }; }
    if (!probe.ok) return ctx.reply('The free API I found for that (' + url.slice(0, 80) + ') is not responding (' + probe.status + '). Not building on a dead source - try again later or name another API.');
    shell.stage([], { kind: 'apicmd', apicmd: { url, cmdName: name, how: String(spec.how || goal).slice(0, 150), goal: goal.slice(0, 200) } });
    shell.audit('APICMD STAGED ' + url.slice(0, 80) + ' as /' + name);
    return ctx.reply('Plan: build /' + name + ' on the free keyless API ' + url.slice(0, 100) + ' (reachable right now). Code is AI-written after your YES, then safety-scanned and syntax-checked before going live (no generated code is executed pre-live; functional behavior is unverified until first use). By rule it can only reply in the chat that calls it, use https, and write only to data/ or /tmp; the scan enforcing that is heuristic, not a proof. Reply YES within 5 minutes, or NO to cancel.');
  }
  return ctx.reply('I could not plan that command. Try naming the npm package directly, e.g. "/agent install <package>".');
}

async function runTemplateConfirmed(ctx, p) {
  const t = p.template;
  const tpl = pickTemplate(t.key) || Object.values((await import('../utils/templates.js')).TEMPLATES).find((x) => x.desc === t.desc);
  const body = (pickTemplate(t.key) || {}).body;
  if (!body) return ctx.reply('Template "' + t.key + '" not found - nothing was added.');
  const code = buildCommandFile(t.cmdName, { desc: t.desc, usage: t.usage, minArgs: t.minArgs, body: body.replaceAll('CMDNAME', t.cmdName) });
  const gv4 = validateGeneratedSource(code, body.replaceAll('CMDNAME', t.cmdName));
  if (!gv4.ok) return ctx.reply('The template failed the structural gate (' + gv4.why.slice(0, 80) + ') - nothing was added. (My bug, not yours.)');
  const chkFile = path.join('src', 'commands', '_chk-' + t.cmdName + '.mjs');
  try {
    fs.writeFileSync(chkFile, code);
    const chk = await shell.execShell('node --check ' + JSON.stringify(chkFile), { timeoutMs: 30000 });
    if (chk.code !== 0) return ctx.reply('The template file failed its syntax check - nothing was added. (My bug, not yours.)');
  } finally { try { fs.unlinkSync(chkFile); } catch {} }
  try {
    const stFile = path.join('src', 'commands', '_st-' + t.cmdName + '.js');
    fs.writeFileSync(stFile, code);
    const mod = await import('./_st-' + t.cmdName + '.js?t=' + Date.now());
    const cmd = mod.default;
    if (!cmd?.name || typeof cmd.run !== 'function') throw new Error('bad module shape');
    const mockCtx = { args: [], sender: ctx.sender, senderJid: ctx.senderJid, jid: ctx.jid, isOwner: true, isGroup: false, msg: ctx.msg, text: '', commands: registry, sock: { sendMessage: async () => ({ key: {} }), updateMediaMessage: async () => ({}) }, reply: async () => ({ key: {} }) };
    await Promise.race([cmd.run(mockCtx), new Promise((_, rej) => setTimeout(() => rej(new Error('self-test timed out (15s)')), 15000))]);
    try { fs.unlinkSync(stFile); } catch {}
  } catch (e) {
    try { fs.unlinkSync(path.join('src', 'commands', '_st-' + t.cmdName + '.js')); } catch {}
    return ctx.reply('The template command failed its load test (' + String(e?.message || e).slice(0, 100) + ') - nothing was added.');
  }
  const finalFile = path.join('src', 'commands', t.cmdName + '.js');
  fs.writeFileSync(finalFile, code);
  const mod = await import('./' + t.cmdName + '.js?t=' + Date.now());
  registry.register(mod.default);
  noteGenerated(t.cmdName, { file: finalFile, source: 'template', template: t.key });
  shell.audit('COMMAND ADDED /' + t.cmdName + ' (template ' + t.key + ')');
  await ctx.reply('/' + t.cmdName + ' is live now (no restart needed). It is from a pre-tested template and loads correctly; if the external service it uses is down, it will say the real reason.');
  return true;
}

async function runApiCmdConfirmed(ctx, p) {
  const { url, cmdName, how, goal } = p.apicmd;
  await ctx.reply('Writing /' + cmdName + ' against ' + url.slice(0, 80) + '...');
  const prompt = 'Write ONLY the JavaScript statements that go INSIDE an async run(ctx) {} function for a WhatsApp bot command named "/' + cmdName + '". It must call the keyless free API endpoint ' + url + ' ONLY via ctx.fetchPublic(url) - it returns {status, body:Buffer}, never use bare fetch (no keys exist). Purpose: ' + how + '. Owner request: ' + goal + '. ' + CODEGEN_RULES;
  let code = null; let lastFail = '';
  for (let attempt = 1; attempt <= 3 && !code; attempt++) {
    let body = '';
    try {
      const r = await ai(prompt + (lastFail ? '\nYour previous attempt was rejected because ' + lastFail + '. Output corrected statements only.' : ''), { temperature: 0.3 }, 'codegen');
      body = r && r.text ? r.text : '';
    } catch (e) { lastFail = 'the AI call failed (' + (e?.message || 'error') + ')'; continue; }
    body = String(body || '').trim().replace(/^```(?:js|javascript)?\s*/im, '').replace(/```\s*$/, '').trim();
    const prob = bodyProblem(body) || apicmdNetworkOk(body);
    if (prob) { lastFail = prob; continue; }
    const candidate = buildCommandFile(cmdName, { desc: how || cmdName + ' helper', usage: '<input>', minArgs: 1, body });
    const gv5 = validateGeneratedSource(candidate, body);
    if (!gv5.ok) { lastFail = 'structural gate: ' + gv5.why; continue; }
    const chkFile = path.join('src', 'commands', '_chk-' + cmdName + '.mjs');
    try {
      fs.writeFileSync(chkFile, candidate);
      const chk = await shell.execShell('node --check ' + JSON.stringify(chkFile), { timeoutMs: 30000 });
      if (chk.code === 0) code = candidate; else lastFail = 'syntax error: ' + String(chk.out || '').trim().split('\n').slice(-2).join(' ').slice(0, 150);
    } finally { try { fs.unlinkSync(chkFile); } catch {} }
  }
  if (!code) return ctx.reply('I could not generate working code for /' + cmdName + ' after 3 tries (last issue: ' + lastFail + '). Nothing was added.');
  // STATIC-ONLY: safety scan + syntax check in the loop above; the generated
  // module is never imported or executed here. Honestly labeled unverified.
  const apiNote = 'passed static checks only (safety scan + syntax; functional behavior UNVERIFIED until you run it)';
  const finalFile = path.join('src', 'commands', cmdName + '.js');
  fs.writeFileSync(finalFile, code);
  const mod = await import('./' + cmdName + '.js?t=' + Date.now());
  registry.register(mod.default);
  noteGenerated(cmdName, { file: finalFile, source: 'builder', apiUrl: url });
  shell.audit('COMMAND ADDED /' + cmdName + ' (API ' + url.slice(0, 60) + ')');
  await ctx.reply('/' + cmdName + ' is live now (no restart needed). ' + apiNote.charAt(0).toUpperCase() + apiNote.slice(1) + '; real features are only proven when you run it - if it errors, it will show the real reason.');
  return true;
}

// ---- Recovery kit (private, owner DM only) --------------------------------
async function runRecoveryKit(ctx) {
  if (ctx.isGroup) return ctx.reply('Recovery kits are private - ask me in our private chat.');
  const { buffer, count } = buildKit();
  const day = new Date().toISOString().slice(0, 10);
  await ctx.sock.sendMessage(ctx.jid, { document: buffer, mimetype: 'application/zip', fileName: 'tab-recovery-' + day + '.zip', caption: '🔐 Private recovery kit: ' + count + ' generated command(s), package manifest, data backup. Keep it private. Restore: quote this file with "/agent restore". After a FULL server wipe the base bot must be redeployed first.' }, { quoted: ctx.msg });
}

async function runRestore(ctx) {
  if (ctx.isGroup) return ctx.reply('Restore is private - use our private chat.');
  const quoted = ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const doc = quoted?.documentMessage;
  if (!doc) return ctx.reply('Quote a recovery kit zip file with "/agent restore". Get one anytime with "/agent recovery kit".');
  let buffer;
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
    const fakeMsg = { key: ctx.msg.key, message: quoted };
    buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
  } catch (e) {
    return ctx.reply('Could not download the quoted file: ' + String(e?.message || e).slice(0, 120) + '. Re-send the kit zip and quote it again.');
  }
  let staged;
  try { staged = unpackKit(buffer); } catch (e) { return ctx.reply('That file is not a valid recovery kit: ' + String(e?.message || e).slice(0, 120)); }
  const n = staged.manifest?.generated?.length || 0;
  shell.stage([], { kind: 'restore', restore: { dir: staged.dir } });
  shell.audit('RESTORE STAGED kit from ' + (staged.manifest?.createdAt || '?') + ' (' + n + ' commands)');
  await ctx.reply('Recovery kit from ' + (staged.manifest?.createdAt || 'unknown date') + ' with ' + n + ' generated command(s). Restore will: rewrite those command files (current versions archived), restore the data backup, install any missing packages, then restart. Reply YES within 5 minutes to go ahead, or NO to cancel.');
}

async function runRestoreConfirmed(ctx, p) {
  const dir = p.restore.dir;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'recovery-manifest.json'), 'utf8'));
    // 1) command files
    let restored = 0;
    for (const e of manifest.generated || []) {
      const staged = path.join(dir, 'cmd_' + e.name + '.js');
      if (!fs.existsSync(staged)) continue;
      archiveVersion(e.name);
      fs.copyFileSync(staged, path.join('src', 'commands', e.name + '.js'));
      noteGenerated(e.name, { ...e, updatedAt: Date.now() });
      restored++;
    }
    // 2) data backup
    const dbz = path.join(dir, 'data-backup.zip');
    if (fs.existsSync(dbz)) {
      const { default: AdmZip } = await import('adm-zip');
      const zip = new AdmZip(dbz);
      for (const entry of zip.getEntries()) {
        if (!/^[\w.-]+\.json$/.test(entry.entryName)) continue;
        fs.writeFileSync(path.join('data', entry.entryName), entry.getData());
      }
    }
    // 3) missing packages
    let current = {};
    try { current = JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies || {}; } catch { /* none */ }
    const missing = Object.entries(manifest.dependencies || {}).filter(([k]) => !current[k]);
    if (missing.length) {
      const args = missing.map(([k, v]) => JSON.stringify(k + '@' + v)).join(' ');
      await ctx.reply('Installing ' + missing.length + ' missing package(s) from the kit manifest...');
      const r = await shell.execShell('npm install ' + args + ' --no-audit --no-fund', { timeoutMs: 300000 });
      if (r.code !== 0) {
        shell.audit('RESTORE partial: package install failed');
        return ctx.reply('Commands and data restored, but package installation failed:\n' + String(r.out || '').slice(-300) + '\nGenerated commands needing those packages will fail until fixed. Not restarting.');
      }
    }
    shell.audit('RESTORE done: ' + restored + ' commands, ' + missing.length + ' packages');
    await ctx.reply('Restore complete: ' + restored + ' command(s), data backup applied' + (missing.length ? ', ' + missing.length + ' package(s) installed' : '') + '. Restarting now - back in about a minute.');
    try { const { shutdown } = await import('../connection/whatsapp.js'); restartBot({ shutdown, log: (m) => logger.warn(m) }).catch((e) => logger.warn('[agent] restart failed: ' + (e?.message || 'error'))); } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
    return true;
  } catch (e) {
    return ctx.reply('Restore failed midway: ' + String(e?.message || e).slice(0, 200) + '. Command files restored so far stay in place; archived versions are under data/cmd-history.');
  }
}

// ---- Event alerts (secured inbound webhook) -------------------------------
async function runEventSetup(ctx) {
  if (ctx.isGroup) return ctx.reply('Event setup is private - use our private chat.');
  const tok = String(process.env.JARVIS_EVENT_TOKEN || '').trim();
  if (!tok) return ctx.reply('JARVIS_EVENT_TOKEN is not set on the server yet - ask me to finish the setup first.');
  const port = Number(process.env.DASHBOARD_PORT || 0);
  if (!port) return ctx.reply('The dashboard port is not exposed on this host (DASHBOARD_PORT unset), so external alerts cannot reach me. An uptime monitor can also just watch the panel URL instead.');
  const base = process.env.DASHBOARD_URL || ('http://<server-address>:' + port);
  await ctx.reply('Event alerts endpoint (keep private):\nPOST ' + base + '/agent-event\nAuthorization: Bearer ' + tok + '\nBody: {"text":"your alert"}\nHealth check for uptime monitors: GET ' + base + '/healthz (no token).\nNote: I can only receive alerts from services you configure - I cannot watch my own outages from inside.');
}
export default {
  name: 'agent',
  aliases: ['do', 'plan'],
  category: 'AI',
  description: 'Give Tab a goal - it plans and runs a few safe steps itself',
  usage: 'agent <goal, e.g. "weather in Kolkata and top 3 news headlines">',
  async run(ctx) {
    if (ctx.operator) shell.audit('OPERATOR ' + ctx.operator.slice(-2) + ' /agent ' + ctx.args.join(' ').slice(0, 120));
    return shell.actorStore.run({ actor: shell.actorOf(ctx) }, () => agentRun(ctx));
  },
};
/** ".agent stop": cancel this user's running task (the owner: every task in this chat, and the download queue). */
export async function runStop(ctx) {
  const owner = !!ctx.isOwner;
  const n = stopTasks(ctx.jid, ctx.sender, { allChat: owner });
  let queue = null;
  if (owner) { try { queue = agentqueue.cancelQueue(); } catch { queue = null; } }
  const parts = [];
  if (n) parts.push('⏹️ Stopped ' + (n > 1 ? n + ' running tasks' : 'the running task') + '. Steps already finished stay done; nothing more will be sent for it.');
  if (queue && (queue.cancelled || queue.active)) parts.push('🛑 Download queue cancelled: ' + queue.cancelled + ' pending item(s).' + (queue.active ? ' The file downloading right now will finish, then everything stops.' : ''));
  if (!parts.length) parts.push('Nothing is running right now.');
  shell.audit('AGENT STOP by ' + String(ctx.sender || '').split('@')[0] + ' tasks=' + n);
  return ctx.reply(parts.join('\n'));
}

async function agentRun(ctx) {
    if (!featOn('agent')) return ctx.reply('Agent mode is turned off right now.');
    const rawGoal = ctx.args.join(' ').trim();
    if (rawGoal.length > MAX_GOAL) return ctx.reply('That request is ' + rawGoal.length + ' characters; the limit is ' + MAX_GOAL + ' per message. Nothing was started. Please send it in smaller parts.');
    const goal = rawGoal;
    let mediaImg = null;
    try { const m = findMedia(ctx.msg); if (m && m.type === 'image' && !m.animated) mediaImg = m; } catch {}
    if (!goal && !mediaImg) return ctx.reply('Tell me the goal. Example: ' + config.prefix + 'agent weather in Kolkata and today\'s top news. You can also send a photo with a caption like "' + config.prefix + 'agent enhance this photo".');
    // "/agent yes" and "/agent no" answer a pending destructive confirmation
    if (/^(yes|no)$/i.test(goal) && featOn('ownershell')) {
      if (await handlePendingAnswer(ctx, /^yes$/i.test(goal))) return;
    }
    // Media-aware goals: a photo with an enhance intent or a question about it.
    if (mediaImg) {
      const route = mediaGoalRoute(goal);
      if (route && route.kind === 'enhance') {
        shell.audit('MEDIA GOAL enhance mode=' + route.mode);
        await ctx.reply('Got the photo - running local ' + route.mode + ' (stays on this bot, no upload). For AI providers use ' + config.prefix + 'remini2 <provider> <scale> yes instead.');
        return runEnhance({ ...ctx, args: ['local'] }, route.mode);
      }
      if (route && route.kind === 'vision') {
        if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) {
          if (!featOn('vision')) return ctx.reply('The vision feature is turned off right now.');
          shell.stage([], { kind: 'mediavision', mediavision: { question: route.question, msg: ctx.msg } });
          shell.audit('MEDIA GOAL vision STAGED: ' + route.question.slice(0, 80));
          return ctx.reply('To answer "' + route.question.slice(0, 120) + '" I would send this photo to an external AI vision service (Cohere Aya Vision, fallback Google Gemini - free tiers; the photo leaves this bot and provider retention is not verified). Reply YES within 5 minutes to send it, or NO to cancel.');
        }
        return ctx.reply('To ask about a photo, use ' + config.prefix + 'vision <your question>. Note: it sends the photo to an external AI service (Cohere Aya Vision, fallback Google Gemini).');
      }
      if (route && route.kind === 'usage') {
        return ctx.reply('I can see the photo. Tell me what to do with it - e.g. "' + config.prefix + 'agent enhance this photo" (local, no upload) or ask a question like "' + config.prefix + 'agent what does this say?" (external AI, I ask before sending).');
      }
    }
    if (!goal) return ctx.reply('Tell me the goal. Example: ' + config.prefix + 'agent weather in Kolkata and today\'s top news');
    if (/^(stop|cancel|abort)$/i.test(goal)) return runStop(ctx);
    if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) {
      if (/^retry\b/i.test(goal)) {
        const n = agentqueue.retryFailed();
        return ctx.reply(n ? '🔁 Retrying the ' + n + ' failed download(s) - one by one, as before.' : 'Nothing failed recently to retry.');
      }
      if (/^undo\b/i.test(goal)) return runUndo(ctx);
      const um = goal.match(/^unschedule\s+(\w+)$/i);
      if (um) return runUnschedule(ctx, um[1]);
      if (/^(schedules|list schedules)$/i.test(goal)) return runListSchedules(ctx);
      const rm = goal.match(/^repair\s+(\w+)$/i); if (rm) return runRepairRoute(ctx, rm[1]);
      if (/^health$/i.test(goal)) return runHealth(ctx);
      if (/^quota$/i.test(goal)) return runQuota(ctx);
      if (/^permissions$/i.test(goal)) return runPermissions(ctx);
      const dm = goal.match(/^(disable|enable)\s+cmd\s+(\w+)$/i); if (dm) return runCmdToggle(ctx, dm[1], dm[2]);
      const hm = goal.match(/^history\s+(\w+)$/i); if (hm) return runHistory(ctx, hm[1]);
      const dfm = goal.match(/^diff\s+(\w+)\s+(\d+)$/i); if (dfm) return runDiff(ctx, dfm[1], +dfm[2]);
      const rcm = goal.match(/^restore\s+cmd\s+(\w+)\s+(\d+)$/i); if (rcm) return runRestoreCmd(ctx, rcm[1], +rcm[2]);
      const psm = goal.match(/^(pause|resume)\s+schedule\s+(\w+)$/i); if (psm) return runPauseSchedule(ctx, psm[1], psm[2]);
      const rsm = goal.match(/^reschedule\s+(\w+)\s+to\s+(.+)$/i); if (rsm) return runReschedule(ctx, rsm[1], rsm[2]);
      if (/^recovery kit$/i.test(goal)) return runRecoveryKit(ctx);
      if (/^restore$/i.test(goal)) return runRestore(ctx);
      if (/^event setup$/i.test(goal)) return runEventSetup(ctx);
      const stym = goal.match(/^reply style\s+(.+)$/i); if (stym) return runReplyStyle(ctx, stym[1]);
    }
    if (!ctx.isOwner && !allow(ctx.sender, Math.max(1, Number(process.env.AGENT_USER_PER_HOUR) || 3))) return ctx.reply('Agent mode is taking a breather (limit per hour reached). Try again in a little while.');
    if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) {
      if (/^\s*install\b/i.test(goal) || parseInstallGoal(goal)) return runInstallFlow(ctx, goal);
      if (/^\s*update\b/i.test(goal)) return runUpdateFlow(ctx, goal);
      if (isSystemStatusGoal(goal)) return runSystemStatus(ctx);
      if (isInfoQuestion(goal)) return runInfoAnswer(ctx, goal);
      if (isJunkCleanupGoal(goal)) return runJunkCleanup(ctx);
      if (isCancelDownloadGoal(goal)) {
        const r = agentqueue.cancelQueue();
        if (!r.cancelled && !r.active) return ctx.reply('No download queue is running right now.');
        return ctx.reply('🛑 Cancelled the download queue: ' + r.cancelled + ' pending item(s) cancelled.' +
          (r.active ? ' The file downloading right now will finish, then everything stops.' : ''));
      }
      if (isMessageJobGoal(goal)) return runMessageJobFlow(ctx, goal);
      if (isBuilderGoal(goal)) return runBuilderFlow(ctx, goal);
      return runShellMode(ctx, goal);
    }
    return runSafeMode(ctx, goal);
}
