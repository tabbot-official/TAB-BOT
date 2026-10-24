// Tab: owner-only control of the bot's own hosting server through the Pterodactyl client API
// (KataBump, Reviactyl, any Pterodactyl panel). Configure in .env:
//   PANEL_URL=https://control.katabump.com   PANEL_SERVER_ID=874ff87b   PANEL_API_KEY=ptlc_...
// (Jarvis hardcoded its own panel and server ccedcbbd; that never worked on another host.)
// The key is never printed: every text that leaves this module goes through redact().
import config from '../config/config.js';
import { isPlaceholderKey } from '../ai/providers.js';

export const SIGNALS = ['start', 'stop', 'restart', 'kill'];

export function panelConfig(env = process.env) {
  const url = String(env.PANEL_URL || env.REVIACTYL_PANEL_URL || '').trim().replace(/\/+$/, '').replace(/\/api\/client.*$/, '');
  const id = String(env.PANEL_SERVER_ID || '').trim();
  const key = String(env.PANEL_API_KEY || env.REVIACTYL_CLIENT_KEY || '').trim();
  const missing = [];
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) missing.push('PANEL_URL');
  if (!/^[a-z0-9-]{8,36}$/i.test(id)) missing.push('PANEL_SERVER_ID');
  if (!key || isPlaceholderKey(key)) missing.push('PANEL_API_KEY');
  return { url, id, key, ok: missing.length === 0, missing };
}

/** Replace the panel key (and any bearer/ptlc token) in any text. */
export function redact(text, cfg = panelConfig()) {
  let s = String(text ?? '');
  if (cfg?.key && cfg.key.length >= 6) s = s.split(cfg.key).join('***');
  return s.replace(/ptl[ac]_[A-Za-z0-9]{20,}/g, '***').replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1***');
}

export class PanelError extends Error {
  constructor(msg, status = 0) { super(msg); this.status = status; }
}

export async function panelRequest(pathPart, { method = 'GET', body, timeoutMs = 15_000, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const cfg = panelConfig(env);
  if (!cfg.ok) throw new PanelError('Panel not configured: set ' + cfg.missing.join(', ') + ' in .env', 0);
  const url = `${cfg.url}/api/client/servers/${encodeURIComponent(cfg.id)}${pathPart}`;
  let r;
  try {
    r = await fetchImpl(url, {
      method,
      headers: { Authorization: 'Bearer ' + cfg.key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new PanelError(redact('Panel unreachable: ' + (e?.name === 'TimeoutError' ? 'timed out' : e?.message || e), cfg), 0);
  }
  if (r.status === 204) return null;
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    let detail = '';
    try { detail = JSON.parse(text)?.errors?.[0]?.detail || ''; } catch { /* not json */ }
    const why = r.status === 401 || r.status === 403 ? 'the panel refused the key (check PANEL_API_KEY is a CLIENT key for this server)'
      : r.status === 404 ? 'server not found (check PANEL_SERVER_ID)'
      : r.status === 409 ? 'the server is busy with another power action'
      : r.status === 429 ? 'the panel rate-limited us, try again in a minute'
      : 'HTTP ' + r.status;
    throw new PanelError(redact('Panel: ' + why + (detail ? ' - ' + String(detail).slice(0, 120) : ''), cfg), r.status);
  }
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

const mb = (b) => Math.round((Number(b) || 0) / 1048576);
function fmtUptime(ms) {
  const s = Math.floor((Number(ms) || 0) / 1000);
  if (!s) return '-';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm';
}

/** Read-only: power state, RAM/CPU/disk now, and the plan limits. */
export async function getStatus(opts = {}) {
  const [res, info] = await Promise.all([
    panelRequest('/resources', opts),
    panelRequest('', opts).catch(() => null),
  ]);
  const a = res?.attributes || {}; const r = a.resources || {};
  const lim = info?.attributes?.limits || {};
  return {
    state: a.current_state || 'unknown',
    suspended: !!a.is_suspended,
    memMB: mb(r.memory_bytes), memLimitMB: Number(lim.memory) || 0,
    cpu: Math.round((Number(r.cpu_absolute) || 0) * 10) / 10, cpuLimit: Number(lim.cpu) || 0,
    diskMB: mb(r.disk_bytes), diskLimitMB: Number(lim.disk) || 0,
    uptime: fmtUptime(r.uptime),
    name: info?.attributes?.name || '',
  };
}

export function formatStatus(s) {
  const icon = { running: '🟢', starting: '🟡', stopping: '🟠', offline: '🔴' }[s.state] || '⚪';
  const of = (v, l, u) => v + ' ' + u + (l ? ' / ' + l + ' ' + u : '');
  return [
    `🖥️ Server${s.name ? ' ' + s.name : ''}: ${icon} ${s.state}${s.suspended ? ' (SUSPENDED)' : ''}`,
    `RAM: ${of(s.memMB, s.memLimitMB, 'MB')}`,
    `CPU: ${s.cpu}%${s.cpuLimit ? ' / ' + s.cpuLimit + '%' : ''}`,
    `Disk: ${of(s.diskMB, s.diskLimitMB, 'MB')}`,
    `Uptime: ${s.uptime}`,
  ].join('\n');
}

/** Send a power signal (owner-confirmed by the caller). */
export async function power(signal, opts = {}) {
  if (!SIGNALS.includes(signal)) throw new PanelError('Unknown power signal: ' + signal);
  await panelRequest('/power', { ...opts, method: 'POST', body: { signal } });
  return true;
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]|\r/g;
/** Last console lines through the panel websocket (read-only: "send logs" only, never "send command"). */
export async function getConsoleLogs({ lines = 25, waitMs = 4000, env = process.env, WebSocketImpl } = {}) {
  const cfg = panelConfig(env);
  const j = await panelRequest('/websocket', { env });
  const token = j?.data?.token, socket = j?.data?.socket;
  if (!token || !socket) throw new PanelError('Panel gave no console socket');
  const WS = WebSocketImpl || (await import('ws')).default;
  const out = [];
  await new Promise((resolve) => {
    let done = false; let ws;
    const finish = () => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch { /* ignore */ } resolve(); };
    const t = setTimeout(finish, waitMs + 6000);
    try { ws = new WS(socket, { origin: cfg.url, headers: { Origin: cfg.url } }); } catch { return finish(); }
    ws.on('open', () => ws.send(JSON.stringify({ event: 'auth', args: [token] })));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.event === 'auth success') { ws.send(JSON.stringify({ event: 'send logs', args: [null] })); setTimeout(finish, waitMs); }
      else if (m.event === 'console output') for (const a of m.args || []) out.push(...String(a).split('\n'));
      else if (m.event === 'jwt error' || m.event === 'token expired') finish();
    });
    ws.on('error', finish);
    ws.on('close', finish);
  });
  const clean = out.map((l) => redact(l.replace(ANSI, ''), cfg).trimEnd()).filter((l) => l.trim() && !/^\s*\[2K/.test(l));
  return clean.slice(-Math.max(1, Math.min(200, lines)));
}

/** Last lines of the bot's own log file (fallback when the panel console is unreachable). */
export async function localLogs(lines = 25) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(config.paths.data, 'logs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort(); } catch { return []; }
  if (!files.length) return [];
  const f = path.join(dir, files[files.length - 1]);
  const st = fs.statSync(f);
  const len = Math.min(st.size, 64 * 1024);
  const fd = fs.openSync(f, 'r');
  try {
    const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len);
    return buf.toString('utf8').split('\n').map((l) => redact(l)).filter(Boolean).slice(-lines);
  } finally { fs.closeSync(fd); }
}

/**
 * Restart the bot. With the panel configured: a panel "restart" (the host stops and starts the container, so the bot
 * really comes back). Without it: the old exit, which only comes back if the host restarts exited processes.
 */
export async function restartBot({ shutdown, log = () => {}, env = process.env, delayMs = 3000, fetchImpl } = {}) {
  await new Promise((r) => setTimeout(r, delayMs)); // let the "restarting" reply leave first
  if (panelConfig(env).ok) {
    try { await power('restart', { env, ...(fetchImpl ? { fetchImpl } : {}) }); log('[panel] restart requested through the panel'); return 'panel'; }
    catch (e) { log('[panel] panel restart failed, exiting instead: ' + e.message); }
  }
  if (shutdown) await shutdown(0);
  return 'exit';
}
