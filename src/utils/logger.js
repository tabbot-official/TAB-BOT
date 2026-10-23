import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

// Persistent file logging (data/logs/jarvis-YYYY-MM-DD.log, keep 5 days).
// Best-effort and synchronous only for the short append - a dead disk must never crash the bot.
function logFile() {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  return path.join(config.paths.data, 'logs', `jarvis-${day}.log`);
}
let logPruned = false;
function appendLog(line) {
  try {
    const f = logFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, line + '\n');
    if (!logPruned) {
      logPruned = true;
      const cut = Date.now() - 5 * 86400e3;
      for (const old of fs.readdirSync(path.dirname(f))) {
        try { const p = path.join(path.dirname(f), old); if (fs.statSync(p).mtimeMs < cut) fs.rmSync(p, { force: true }); } catch {}
      }
    }
  } catch { /* never let logging break the bot */ }
}

// libsignal prints whole session objects (including key material) with console.info; drop them.
for (const m of ['info', 'log', 'warn', 'error']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => {
    if (typeof a[0] === 'string' && /^(Closing|Removing|Opening|Migrating)\b.*session|^Session already|^Closing open session/i.test(a[0])) return;
    clearLive();
    orig(...a);
  };
}

export const live = { active: false, online: null };
const clearLive = () => { if (live.active) process.stdout.write('\r\x1b[2K'); };
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

// Strip things that look like secrets before anything is printed.
function redact(text) {
  return String(text)
    .replace(/(password|passwd|token|secret|cookie|authorization|apikey|api_key)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[redacted]')
    .replace(/(\d{1,3})\d{5,}(\d{3})/g, '$1*****$2'); // phone-like numbers
}

const COLOR = !process.env.NO_COLOR && process.env.LOG_COLOR !== 'off' && !process.env.NODE_TEST_CONTEXT;
const C = { dim: '\x1b[90m', info: '\x1b[1;32m', warn: '\x1b[1;33m', error: '\x1b[1;31m', debug: '\x1b[1;35m', tag: '\x1b[1;36m', num: '\x1b[33m', off: '\x1b[0m' };
// Same text layout as before ("ISO [LEVEL] [tag] message"), only wrapped in colour codes so grep and parsers still match.
function fmt(level, text) {
  const ts = new Date().toISOString(), lv = `[${level.toUpperCase()}]`;
  if (!COLOR) return `${ts} ${lv} ${text}`;
  let body = text.replace(/^\[([\w:.-]+)\]/, `${C.tag}[$1]${C.off}`);
  if (level === 'error') body = `${C.error}${body}${C.off}`;
  else if (level === 'warn') body = `${C.warn}${body}${C.off}`;
  else body = body.replace(/(?<![\w.\x1b\[;])(\d+(?:\.\d+)?)(?![\w;\]])/g, `${C.num}$1${C.off}`);
  return `${C.dim}${ts}${C.off} ${C[level]}${lv}${C.off} ${body}`;
}
function write(level, args) {
  if (LEVELS[level] < threshold) return;
  const msg = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const line = fmt(level, redact(msg));
  if (/^WhatsApp connection established/.test(msg)) live.online = true;
  else if (/^Connection closed/.test(msg)) live.online = false;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  appendLog(`${new Date().toISOString()} [${level.toUpperCase()}] ${redact(msg)}`);
}

const errorListeners=new Set();
export const onError=fn=>errorListeners.add(fn);
const logger = {
  debug: (...a) => write('debug', a),
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => {write('error', a);for(const fn of errorListeners)try{fn();}catch{}},
  redact,
};
export const colorOn = COLOR;

export default logger;
