import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { colorOn, live } from './logger.js';
import { getUsage } from '../database/database.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ART = [
  '████████╗ █████╗ ██████╗ ',
  '╚══██╔══╝██╔══██╗██╔══██╗',
  '   ██║   ███████║██████╔╝',
  '   ██║   ██╔══██║██╔══██╗',
  '   ██║   ██║  ██║██████╔╝',
  '   ╚═╝   ╚═╝  ╚═╝╚═════╝ ',
];
const GRAD = [51, 45, 39, 33, 63, 99];
const RAINBOW = [196, 202, 208, 214, 220, 226, 190, 154, 118, 82, 46, 48, 50, 51, 45, 39, 33, 27, 21, 57, 93, 129, 165, 201, 199, 197];
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const R = '\x1b[0m';
const col = (n, t) => (colorOn ? `\x1b[1;38;5;${n}m${t}${R}` : t);
const out = (s) => process.stdout.write(s + '\n');
const hsv = (h) => { h = ((h % 360) + 360) % 360; const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; };
const tc = (h, t, bold = true) => { const [r, g, b] = hsv(h); return `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${t}${R}`; };
const truecolor = () => process.env.TRUECOLOR !== 'off';
const rainbow = (text, shift = 0) => (colorOn ? [...text].map((ch, i) => (ch === ' ' ? ch : truecolor() ? tc(i * 14 + shift * 9, ch) : col(RAINBOW[(i + shift) % RAINBOW.length], ch))).join('') : text);
const off = () => process.env.NODE_TEST_CONTEXT || process.env.BANNER === 'off';


const rnd = (a, b) => a + Math.random() * (b - a);
/** Types text like a person: uneven speed, pauses after words and punctuation, a rare typo that gets backspaced. */
async function typeOut(text, paint = (t) => t, { typos = true } = {}) {
  let shown = '';
  const draw = (cursor = true) => process.stdout.write('\r\x1b[2K' + paint(shown) + (cursor && colorOn ? col(255, '▌') : ''));
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (typos && /[a-z]/.test(ch) && Math.random() < 0.02 && i > 3) {
      shown += String.fromCharCode(ch.charCodeAt(0) + (ch === 'z' ? -1 : 1)); draw(); await sleep(rnd(70, 130));
      await sleep(rnd(150, 300)); shown = shown.slice(0, -1); draw(); await sleep(rnd(80, 160));
    }
    shown += ch; draw();
    let d = rnd(8, 26);
    if (ch === ' ') d += rnd(5, 25);
    if (/[.,!…]/.test(ch)) d += rnd(40, 90);
    if (Math.random() < 0.04) d += rnd(100, 220);
    await sleep(d);
  }
  draw(false); process.stdout.write('\n');
}


/** Matrix-style glyph rain that thins out and clears. */
async function matrixRain(rows = 4, cols = 46, frames = 9) {
  if (!colorOn) return;
  const G = '01$#@%&*+=<>/\\|';
  for (let r = 0; r < rows; r++) out('');
  for (let f = 0; f < frames; f++) {
    process.stdout.write(`\x1b[${rows}A`);
    const keep = 1 - f / frames;
    for (let r = 0; r < rows; r++) {
      let line = '  ';
      for (let c = 0; c < cols; c++) {
        if (Math.random() > keep) { line += ' '; continue; }
        const shade = [22, 28, 34, 40, 46, 82, 118][Math.floor(Math.random() * 7)];
        line += col(shade, G[Math.floor(Math.random() * G.length)]);
      }
      out('\x1b[2K' + line);
    }
    await sleep(55);
  }
  process.stdout.write(`\x1b[${rows}A\x1b[J`);
}

/** Doom-style fire, half-block truecolor pixels. Ignites at the bottom, blazes, then fades out. Erases itself. */
async function fire(rows = 6, cols = 52, frames = 24) {
  if (!colorOn || !truecolor()) return;
  const H = rows * 2; const heat = new Uint8Array(cols * H);
  const pal = (v) => { const t = v / 36; const r = Math.min(255, Math.round(t * 520)); const g = Math.max(0, Math.min(255, Math.round((t - 0.35) * 420))); const b = Math.max(0, Math.min(255, Math.round((t - 0.8) * 1200))); return [r, g, b]; };
  for (let r = 0; r < rows; r++) out('');
  for (let f = 0; f < frames; f++) {
    const fuel = f < frames - 6 ? 36 : 0;
    for (let x = 0; x < cols; x++) heat[(H - 1) * cols + x] = fuel ? 30 + Math.floor(Math.random() * 7) : 0;
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < cols; x++) {
      const src = (y + 1) * cols + x; const dx = x + Math.floor(Math.random() * 3) - 1;
      const v = heat[(y + 1) * cols + Math.min(cols - 1, Math.max(0, dx))] - (Math.random() < 0.55 ? 1 : 0) - (y < 2 ? 3 : 0);
      heat[y * cols + x] = Math.max(0, v); void src;
    }
    process.stdout.write(`\x1b[${rows}A`);
    for (let r = 0; r < rows; r++) {
      let line = '  ';
      for (let x = 0; x < cols; x++) { const a = pal(heat[(r * 2) * cols + x]); const b = pal(heat[(r * 2 + 1) * cols + x]); line += `\x1b[38;2;${a[0]};${a[1]};${a[2]};48;2;${b[0]};${b[1]};${b[2]}m▀`; }
      out('\x1b[2K' + line + R);
    }
    await sleep(42);
  }
  process.stdout.write(`\x1b[${rows}A\x1b[J`);
}

/** Plasma shader: layered sine fields mapped to hue, half-block pixels. Erases itself. */
async function plasma(rows = 5, cols = 52, frames = 18) {
  if (!colorOn || !truecolor()) return;
  for (let r = 0; r < rows; r++) out('');
  for (let f = 0; f < frames; f++) {
    const t = f * 0.28; process.stdout.write(`\x1b[${rows}A`);
    const fade = f > frames - 5 ? (frames - f) / 5 : 1;
    for (let r = 0; r < rows; r++) {
      let line = '  ';
      for (let x = 0; x < cols; x++) {
        const px = (y) => { const v = Math.sin(x / 5 + t) + Math.sin(y / 3 - t * 1.3) + Math.sin((x + y) / 6 + t * 0.7) + Math.sin(Math.hypot(x - cols / 2, y - rows) / 4 - t); const [rr, gg, bb] = hsv(v * 45 + t * 40); return [Math.round(rr * fade), Math.round(gg * fade), Math.round(bb * fade)]; };
        const a = px(r * 2); const b = px(r * 2 + 1);
        line += `\x1b[38;2;${a[0]};${a[1]};${a[2]};48;2;${b[0]};${b[1]};${b[2]}m▀`;
      }
      out('\x1b[2K' + line + R);
    }
    await sleep(48);
  }
  process.stdout.write(`\x1b[${rows}A\x1b[J`);
}

/** Gauge bar with a heat colour ramp. */
const gauge = (pct, w = 10) => { const n = Math.max(0, Math.min(w, Math.round(pct * w))); let o = ''; for (let k = 0; k < w; k++) o += k < n ? (colorOn && truecolor() ? tc(120 - (k / w) * 120, '█') : col(46, '█')) : col(238, '░'); return o; };

/** Brief horizontal glitch/colour flicker over the banner. */
async function glitch(lines = ART, frames = 7) {
  if (!colorOn) return;
  const pal = [196, 51, 201, 46, 226];
  for (let f = 0; f < frames; f++) {
    process.stdout.write(`\x1b[${lines.length}A`);
    for (let r = 0; r < lines.length; r++) {
      const hit = Math.random() < 0.45;
      const shift = hit ? ' '.repeat(Math.floor(Math.random() * 4)) : '';
      out('\x1b[2K' + shift + col(hit ? pal[Math.floor(Math.random() * pal.length)] : GRAD[r], lines[r]));
    }
    await sleep(55);
  }
  process.stdout.write(`\x1b[${lines.length}A`);
  for (let r = 0; r < lines.length; r++) out('\x1b[2K' + col(GRAD[r], lines[r]));
}

/** Three module bars filling at different speeds at once. */
async function multiBar() {
  const mods = [['Core engine', 1.0], ['Command registry', 0.7], ['Network link', 0.5]];
  const W = 26; const prog = mods.map(() => 0);
  const lineOf = (k, done) => {
    const n = Math.round(prog[k] * W);
    const bar = colorOn ? [...'█'.repeat(n)].map((ch, j) => (truecolor() ? tc(120 + (j / W) * 200, ch) : col(RAINBOW[Math.floor((j / W) * 22) + 4] ?? 51, ch))).join('') + '\x1b[90m' + '░'.repeat(W - n) + R : '█'.repeat(n) + '░'.repeat(W - n);
    const pct = String(Math.round(prog[k] * 100)).padStart(3) + '%';
    return `  ${prog[k] >= 1 ? col(46, '✔') : col(51, SPIN[(n + k) % SPIN.length])} ${mods[k][0].padEnd(17)}${bar} ${col(226, pct)}`;
  };
  for (let k = 0; k < mods.length; k++) out('');
  for (let f = 0; f < 60; f++) {
    mods.forEach(([, sp], k) => { prog[k] = Math.min(1, prog[k] + sp * (0.035 + Math.random() * 0.03)); });
    process.stdout.write(`\x1b[${mods.length}A`);
    mods.forEach((_, k) => out('\x1b[2K' + lineOf(k)));
    if (prog.every((x) => x >= 1)) break;
    await sleep(32);
  }
}

/** Spinning orbit/radar ring with a fading comet tail (truecolor). */
async function orbit(frames = 14) {
  if (!colorOn) return;
  const RW = 25, RH = 9, cx = 12, cy = 4, N = 28;
  const pts = Array.from({ length: N }, (_, k) => { const a = (k / N) * Math.PI * 2; return [Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 4)]; });
  for (let r = 0; r < RH; r++) out('');
  for (let f = 0; f < frames; f++) {
    const g = Array.from({ length: RH }, () => Array(RW).fill(' '));
    pts.forEach(([x, y]) => { g[y][x] = '\x1b[90m·\x1b[0m'; });
    for (let t = 0; t < 9; t++) { const [x, y] = pts[((f * 2 - t) % N + N) % N]; g[y][x] = tc(180 + f * 6 - t * 12, t === 0 ? '●' : t < 4 ? '◉' : '○'); }
    g[cy][cx] = tc(f * 15, ['◜', '◝', '◞', '◟'][f % 4]);
    const label = ['INITIALIZING', 'CALIBRATING', 'SYNCING', 'ARMING'][Math.floor((f / frames) * 4)];
    process.stdout.write(`\x1b[${RH}A`);
    for (let r = 0; r < RH; r++) out('\x1b[2K     ' + g[r].join('') + (r === cy ? '  ' + tc(f * 10, label.padEnd(14)) : ''));
    await sleep(45);
  }
  process.stdout.write(`\x1b[${RH}A\x1b[J`);
}

function check(name, fn) {
  try { const r = fn(); return r === false ? [false, 'missing'] : [true, typeof r === 'string' ? r : 'ok']; } catch (e) { return [false, e.message.slice(0, 30)]; }
}

/** Startup-only animation: system check, rainbow banner, gradient loading bar. */
export async function playBanner({ name = 'Tab', version = '' } = {}) {
  if (off()) return;
  out('');
  await matrixRain();
  await fire();
  await orbit();
  await plasma();
  // 1. Real system checks, one spinner line each.
  const root = process.cwd();
  const checks = [
    ['Node runtime', () => process.version],
    ['Memory', () => `${Math.round(os.freemem() / 1048576)} MB free of ${Math.round(os.totalmem() / 1048576)} MB`],
    ['yt-dlp', () => fs.existsSync(path.join(root, 'bin', 'yt-dlp')) || 'system'],
    ['ffmpeg', () => { const r = spawnSync('ffmpeg', ['-version'], { timeout: 3000 }); return r.status === 0 ? 'ready' : false; }],
    ['Data folder', () => { fs.accessSync(path.resolve(root, process.env.DATA_FOLDER || 'data'), fs.constants.W_OK); return 'writable'; }],
    ['WhatsApp session', () => (fs.existsSync(path.join(root, 'auth')) ? 'found' : 'new (pairing needed)')],
  ];
  out(col(51, '  ▸ SYSTEM CHECK'));
  for (const [label, fn] of checks) {
    const [ok, info] = check(label, fn);
    for (let i = 0; i < 5; i++) { process.stdout.write(`\r  ${col(214, SPIN[i])} ${label}...`); await sleep(40); }
    process.stdout.write('\r\x1b[2K' + `  ${ok ? col(46, '✔') : col(196, '✖')} ${label.padEnd(18)}${colorOn ? '\x1b[90m' + (info === true ? 'ok' : info) + R : info}\n`);
  }
  out('');
  // 2. Banner draws line by line, then a rainbow wave sweeps over it.
  for (let i = 0; i < ART.length; i++) { out(col(GRAD[i], ART[i])); await sleep(60); }
  await glitch();
  if (colorOn) {
    for (let f = 0; f < 14; f++) {
      process.stdout.write(`\x1b[${ART.length}A`);
      for (let r = 0; r < ART.length; r++) out('\x1b[2K' + rainbow(ART[r], f * 3 + r * 2));
      await sleep(55);
    }
    process.stdout.write(`\x1b[${ART.length}A`);
    for (let r = 0; r < ART.length; r++) out('\x1b[2K' + col(GRAD[r], ART[r]));
  }
  // 3. Subtitle types out in rainbow.
  const sub = `  ${name.toUpperCase()} · WhatsApp assistant${version ? ' · v' + version : ''}`;
  await typeOut(sub, (t) => rainbow(t, t.length), { typos: false });
  out(colorOn ? '\x1b[90m  ' + '━'.repeat(44) + R : '  ' + '-'.repeat(44));
  // 4. Three module bars fill in parallel.
  await multiBar();
  out(`  ${col(46, '✔')} ${col(46, 'Launch sequence complete')}\n`);
  // 4. Live typing session.
  if (process.env.BANNER !== 'fast') {
    await typeOut('  jarvis@aws:~$ ./wake-up --mode=max', (t) => col(46, t), { typos: false });
    await sleep(250);
    const lines = [
      ['  ▸ Hello Rohan, I am waking up...', 51],
      ['  ▸ Loading commands, languages, downloader...', 213],
      ['  ▸ Linking to WhatsApp. Almost there!', 226],
    ];
    for (const [t, c] of lines) { await typeOut(t, (x) => col(c, x)); await sleep(rnd(60, 140)); }
    out('');
  }
}

/** Boxed summary printed once after the startup checks. */
export function bootBox(rows) {
  if (off()) return;
  const plain = rows.map(([a, b]) => `${a}: ${b}`);
  const w = Math.max(...plain.map((x) => x.length)) + 2;
  const g = (t) => (colorOn ? `\x1b[1;32m${t}${R}` : t);
  out(g('╭' + '─'.repeat(w) + '╮'));
  rows.forEach(([a, b], i) => out(g('│') + ' ' + (colorOn ? `\x1b[1;36m${a}${R}: ${b}` : plain[i]) + ' '.repeat(w - plain[i].length - 1) + g('│')));
  out(g('╰' + '─'.repeat(w) + '╯'));
}

const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + 'd ' : ''}${h || d ? h + 'h ' : ''}${m}m ${Math.floor(s % 60)}s`; };

const SPARK = '▁▂▃▄▅▆▇█';
const spark = (arr) => { const lo = Math.min(...arr), hi = Math.max(...arr), d = hi - lo || 1; return arr.map((v) => SPARK[Math.min(7, Math.floor(((v - lo) / d) * 7.99))]).join(''); };
const gradText = (t, shift) => [...t].map((ch, k) => col(RAINBOW[(k * 2 + shift) % RAINBOW.length], ch)).join('');

/** One live status line redrawn in place (rotating views). Logs clear it first, so it never fills the log. LIVE_TICKER=off disables. */
export function startTicker() {
  if (off() || !colorOn || process.env.LIVE_TICKER === 'off') return;
  let i = 0; let announced = false; let busy = false; let shimmer = 0; const ramHist = [];
  const tick = () => {
    try {
      i++;
      if (busy || live.online === null) return; // never draw over pairing prompts before the first connection
      if (live.online && !announced) {
        // Shimmer on the single ticker line (log-safe), then print one static box.
        if (!shimmer) shimmer = 0;
        shimmer++;
        const banner = '  ✦✦✦  J A R V I S   I S   O N L I N E  ✦✦✦  ';
        void banner;
        if (shimmer >= 1) {
          announced = true; process.stdout.write('\r\x1b[2K'); live.active = false;
          out(rainbow('  ╭──────────────────────────────╮'));
          out(rainbow('  │   ✦  JARVIS IS ONLINE  ✦     │'));
          out(rainbow('  ╰──────────────────────────────╯'));
        }
        return;
      }
      const up = Math.floor(process.uptime());
      const ramMb = Math.round(process.memoryUsage().rss / 1048576);
      const load = os.loadavg()[0];
      ramHist.push(ramMb); if (ramHist.length > 16) ramHist.shift();
      let cmds = 0; try { cmds = Object.values(getUsage() || {}).reduce((a, b) => a + (Number(b) || 0), 0); } catch { /* optional */ }
      const state = live.online === false ? col(196, '● RECONNECTING') : live.online ? col(46, i % 6 < 3 ? '●' : '○') + col(46, ' ONLINE') : col(214, '● STARTING');
      const sep = col(240, '│');
      const view = Math.floor(i / 14) % 4; // rotates about every 4 seconds
      let body;
      if (view === 0) {
        const wave = [...'▁▂▃▄▅▆▇█▇▆▅▄▃▂'].map((_, k) => '▁▂▃▄▅▆▇█▇▆▅▄▃▂'[(k + i) % 14]).slice(0, 10).join('');
        body = `⏱ ${col(226, dur(up))} ${sep} 🧠 ${col(213, ramMb + ' MB')} ${sep} ⚡ ${col(51, cmds + ' cmds')} ${col(81 + (i % 6), wave)}`;
      } else if (view === 1) {
        const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Calcutta' });
        body = `🕒 ${col(226, t + ' IST')} ${sep} RAM ${col(213, spark(ramHist))} ${sep} CPU ${col(46, load.toFixed(2))} ${sep} ${gradText('JARVIS', i)}`;
      } else if (view === 3) {
        const cpus = os.cpus().length || 1; const lp = Math.min(1, load / cpus); const rp = Math.min(1, ramMb / Math.max(1, os.totalmem() / 1048576));
        body = `CPU ${gauge(lp)} ${col(226, Math.round(lp * 100) + '%')} ${sep} RAM ${gauge(rp * 4)} ${col(213, ramMb + 'MB')} ${sep} ${gradText('◢◣◤◥', i)}`;
      } else {
        const msg = `   ✦ Tab is awake · ${cmds} commands handled · send ${process.env.PREFIX || '/'}menu on WhatsApp ✦   `;
        const w = 40; const o = i % msg.length; const win = (msg + msg).slice(o, o + w);
        body = `${gradText(win, i * 2)}`;
      }
      process.stdout.write('\r\x1b[2K' + `  ${col(51, SPIN[i % SPIN.length])} ${state} ${sep} ${body}`);
      live.active = true;
    } catch { /* never break the bot for a status line */ }
  };
  tick();
  setInterval(tick, 300).unref();
}
