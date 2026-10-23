import { formatBytes } from './helpers.js';

const fmtEta = (s) => {
  if (!Number.isFinite(s) || s < 0) return '--';
  s = Math.ceil(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export function renderProgress({ name, received, total, speed, kind, done, bytes = 0, byteSpeed = 0, files = 0 }) {
  if (kind === 'task') {
    const pctT = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : null;
    const filledT = pctT === null ? 0 : Math.round(pctT / 5);
    const barT = pctT === null ? '[░░░░░░░░░░░░░░░░░░░░]' : `[${'█'.repeat(filledT)}${'░'.repeat(20 - filledT)}] ${pctT}%`;
    const etaT = done ? '0s' : total > 0 && speed > 0 ? fmtEta((total - received) / speed) : 'calculating...';
    return [
      done ? '✅ Done' : '🤖 Working on it',
      `🪜 ${String(name || 'Planning...').slice(0, 80)}`,
      barT,
      `🔢 Steps: ${received}${total > 0 ? ` / ~${total}` : ''}`,
      ...(bytes > 0 ? [`📦 Downloaded: ${formatBytes(bytes)}${files > 0 ? ` in ${files} file${files > 1 ? 's' : ''}` : ''}`] : []),
      ...(bytes > 0 ? [`⚡ Speed: ${byteSpeed > 0 ? `${formatBytes(byteSpeed)}/s` : 'calculating...'}`] : []),
      `⏱️ ETA: ${etaT}`,
    ].join('\n');
  }
  const icon = kind === 'audio' ? '🎵' : '🎬';
  const pct = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : null;
  const filled = pct === null ? 0 : Math.round(pct / 5);
  const bar = pct === null ? '[░░░░░░░░░░░░░░░░░░░░]' : `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${pct}%`;
  const eta = done ? '0s' : total > 0 && speed > 0 ? fmtEta((total - received) / speed) : 'calculating...';
  return [
    done ? '✅ Downloaded - sending now...' : '⬇️ Downloading',
    `${icon} ${String(name || 'Fetching file...').slice(0, 80)}`,
    bar,
    `📦 Size: ${formatBytes(received)}${total > 0 ? ` / ${formatBytes(total)}` : ''}`,
    `⚡ Speed: ${speed > 0 ? `${formatBytes(speed)}/s` : 'calculating...'}`,
    `⏱️ ETA: ${eta}`,
  ].join('\n');
}

const PHASES = { preparing: 'Preparing video', converting: 'Converting video', checking: 'Checking video', uploading: 'Uploading' };
export function renderStage(name, p = {}) {
  const pct = Number.isFinite(p.percent) ? Math.max(0, Math.min(100, Math.floor(p.percent))) : null;
  const filled = pct === null ? 0 : Math.round(pct / 5);
  const bar = pct === null ? '[░░░░░░░░░░░░░░░░░░░░]' : `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${pct}%`;
  const eta = Number.isFinite(p.remainingSeconds) ? fmtEta(p.remainingSeconds) : 'calculating...';
  return [`⚙️ ${PHASES[p.phase] || 'Processing'}`, `🎬 ${String(name || 'Video').slice(0, 80)}`, bar, `⏱️ ETA: ${eta}`, 'Upload follows automatically.'].join('\n');
}

/** Edits one chat message with live progress, at most once per intervalMs. Never throws. */
export function createProgressMessage(ctx, kind, intervalMs = 3000) {
  let sent = null; let last = 0; let lastText = ''; let busy = false; let closed = false;
  const state = { name: '', received: 0, total: 0, speed: 0, kind };
  const start = Date.now();
  const push = async (force = false) => {
    if (closed || busy) return;
    const now = Date.now();
    if (!force && now - last < intervalMs) return;
    const text = renderProgress(state);
    if (text === lastText) return;
    busy = true; last = now;
    try {
      if (!sent) sent = await ctx.reply(text);
      else await ctx.sock.sendMessage(ctx.jid, { text, edit: sent.key });
      lastText = text;
    } catch { /* progress is best effort */ } finally { busy = false; }
  };
  return {
    async begin() { await push(true); },
    update(p = {}) {
      if (p.name) state.name = p.name;
      if (p.total !== undefined) state.total = p.total;
      if (p.bytes !== undefined) state.bytes = p.bytes;
      if (p.byteSpeed !== undefined) state.byteSpeed = p.byteSpeed;
      if (p.files !== undefined) state.files = p.files;
      if (p.received !== undefined) {
        state.received = p.received;
        const secs = (Date.now() - start) / 1000;
        state.speed = secs > 0.5 ? p.received / secs : 0;
      }
      push(false);
    },
    async finish(ok = true) {
      closed = false;
      if (ok) state.done = true;
      if (ok && state.received) { state.total = state.total || state.received; state.received = state.total; }
      await push(true);
      closed = true;
    },
    /** Replaces the message body (still an edit of the same message). */
    async text(t) {
      if (!sent) return;
      try { await ctx.sock.sendMessage(ctx.jid, { text: t, edit: sent.key }); lastText = t; } catch { /* best effort */ }
    },
    /** Live conversion stage: edits the same message, throttled. */
    async stage(p) {
      const now = Date.now();
      if (busy || now - last < intervalMs) return;
      last = now; busy = true;
      try { await this.text(renderStage(state.name, p)); } finally { busy = false; }
    },
    close() { closed = true; },
  };
}
