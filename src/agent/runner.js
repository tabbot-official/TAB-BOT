// Tab: long .agent tasks - plan -> run -> summary.
// - One running task per chat+user; ".agent stop" cancels it (the owner can stop any task in the chat).
// - Every step has a timeout and the whole task a cap. A step that times out or is cancelled is abandoned: its
//   chat output is muted from then on, so a late file or message never arrives after the summary.
// - Progress is ONE message edited in place (throttled), never a stream of new messages.

export class StepTimeout extends Error { constructor(ms) { super('timed out after ' + Math.round(ms / 1000) + ' s'); this.name = 'StepTimeout'; } }
export class TaskCancelled extends Error { constructor() { super('stopped'); this.name = 'TaskCancelled'; } }

const tasks = new Map(); // key -> { id, goal, controller, startedAt, by }
let seq = 0;
export const taskKey = (jid, user) => String(jid || '?') + '|' + String(user || '?').split('@')[0].split(':')[0];

/** Register a task; returns null when this chat+user already has one running. */
export function beginTask(key, goal = '') {
  if (tasks.has(key)) return null;
  const t = { id: ++seq, key, goal: String(goal).slice(0, 80), controller: new AbortController(), startedAt: Date.now() };
  tasks.set(key, t);
  return t;
}
export function endTask(t) { if (t && tasks.get(t.key) === t) tasks.delete(t.key); }
export function activeTask(key) { return tasks.get(key) || null; }
/** Stop the caller's task, or (allChat) every task in that chat. Returns how many were stopped. */
export function stopTasks(jid, user, { allChat = false } = {}) {
  let n = 0;
  for (const [k, t] of tasks) {
    if (allChat ? k.startsWith(String(jid || '?') + '|') : k === taskKey(jid, user)) { t.controller.abort(); tasks.delete(k); n++; }
  }
  return n;
}
export function _resetTasks() { for (const t of tasks.values()) t.controller.abort(); tasks.clear(); }

/** Race a promise against a timeout and an abort signal. */
export function withTimeout(promise, ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new TaskCancelled());
    const timer = setTimeout(() => reject(new StepTimeout(ms)), Math.max(1, ms));
    const onAbort = () => { clearTimeout(timer); reject(new TaskCancelled()); };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); resolve(v); },
      (e) => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); reject(e); },
    );
  });
}

/** A ctx whose chat output is dropped once `muted()` is true (a step that was abandoned by a timeout or stop). */
export function mutedCtx(ctx, muted) {
  const sock = ctx.sock ? new Proxy(ctx.sock, {
    get(target, prop, recv) {
      if (prop === 'sendMessage') return async (...a) => (muted() ? null : target.sendMessage(...a));
      const v = Reflect.get(target, prop, recv);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) : ctx.sock;
  return { ...ctx, sock, reply: async (...a) => (muted() ? null : ctx.reply(...a)) };
}

const ICON = { pending: '▫️', running: '⏳', ok: '✅', failed: '❌', timeout: '⌛', cancelled: '⏹️', skipped: '⏭️' };
export function renderPlan(title, rows, { footer = '' } = {}) {
  return [title, ...rows.map((r, i) => `${i + 1}. ${ICON[r.status] || '▫️'} ${r.label}${r.note ? ' - ' + r.note : ''}`), ...(footer ? ['', footer] : [])].join('\n');
}

/**
 * Run steps one by one. exec(step, stepCtx) does the work; stepCtx is muted after a timeout/stop.
 * Returns { rows, cancelled, capped, ms }.
 */
export async function runSteps({ steps, label, exec, ctx, signal, stepTimeoutMs = () => 60_000, totalCapMs = 300_000, onProgress = async () => {}, now = Date.now }) {
  const started = now();
  const rows = steps.map((s) => ({ label: label(s), status: 'pending', note: '' }));
  let cancelled = false, capped = false;
  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) { cancelled = true; break; }
    const left = totalCapMs - (now() - started);
    if (left <= 0) { capped = true; break; }
    rows[i].status = 'running';
    try { await onProgress(rows, i); } catch { /* progress is cosmetic */ }
    let abandoned = false;
    const stepCtx = ctx ? mutedCtx(ctx, () => abandoned || !!signal?.aborted) : undefined;
    const limit = Math.min(stepTimeoutMs(steps[i]), left);
    const t0 = now();
    try {
      const r = await withTimeout(exec(steps[i], stepCtx), limit, signal);
      rows[i].status = r && r.ok === false ? 'failed' : 'ok';
      rows[i].note = r && r.ok === false ? String(r.text || '').slice(0, 120) : '';
      rows[i].result = r;
    } catch (e) {
      abandoned = true;
      if (e instanceof TaskCancelled) { rows[i].status = 'cancelled'; cancelled = true; }
      else if (e instanceof StepTimeout) { rows[i].status = 'timeout'; rows[i].note = e.message; if (limit < stepTimeoutMs(steps[i])) capped = true; }
      else { rows[i].status = 'failed'; rows[i].note = String(e?.message || 'error').slice(0, 120); }
    }
    rows[i].ms = now() - t0;
    if (cancelled || capped) break;
  }
  for (const r of rows) if (r.status === 'pending') r.status = 'skipped';
  return { rows, cancelled, capped, ms: now() - started };
}

/** Throttled single-message progress: edits one message at most every minGapMs (the final render always goes out). */
export function progressEditor(sendEdit, { minGapMs = 2500, now = Date.now } = {}) {
  let last = -Infinity, lastText = '';
  return async (text, { force = false } = {}) => {
    if (text === lastText) return false;
    if (!force && now() - last < minGapMs) return false;
    last = now(); lastText = text;
    try { await sendEdit(text); return true; } catch { return false; }
  };
}

export function fmtSecs(ms) { const s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
