// WhatsApp-style chat card + animated (live typing) stickers. Free: sharp only, no network beyond what engine.js already does.
import { setWidthScale, buildSvg, tokenize, wrap, fit, tokenWidth, esc, clean, initials, setMeasured, measureChars, fetchEmoji, countWords } from './engine.js';

const SIZE = 512;
const NAME_COLORS = ['#1f7aec', '#d9488a', '#e0702b', '#00a884', '#8e44ad', '#b58900', '#2a9d8f', '#c0392b'];
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** One WhatsApp chat-screen frame. opts: {reveal (word count|undefined=all), typing (bool), status, ticks:'grey'|'blue'|'', time} */
export function buildWaSvg(...a) { try { return buildWaInner(...a); } finally { setWidthScale(1); } }
const tokLen = (t) => (t.k === 't' ? [...t.v].length : 1);
/** Total typeable characters in the laid-out message. */
export function waCharCount(text) {
  setWidthScale(1);
  try {
    const tokens = tokenize(String(text).slice(0, 700));
    const sn = String(text).length <= 110; const { fs, lines } = fit(tokens, 340, 430 - (sn ? 212 : 158) - 32, { min: 14, max: 26 });
    void fs; return lines.reduce((n, l) => n + l.reduce((m, t) => m + tokLen(t), 0), 0);
  } finally { setWidthScale(1); }
}

const NOTICE = ['Messages and calls are end-to-end encrypted. No one outside', 'of this chat, not even WhatsApp, can read or listen to them.'];
const DOODLE = (() => {
  const st = 'fill="none" stroke="#c9c1b2" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"';
  const g = (x, y, r, d) => `<g transform="translate(${x} ${y}) rotate(${r})" ${st}>${d}</g>`;
  const heart = '<path d="M0 -2 C-5 -9 -12 -2 0 7 C12 -2 5 -9 0 -2 Z"/>';
  const star = '<polygon points="0,-8 2.4,-2.5 8,-2.5 3.5,1.3 5,7.5 0,4 -5,7.5 -3.5,1.3 -8,-2.5 -2.4,-2.5"/>';
  const smile = '<circle r="8"/><circle cx="-3" cy="-2" r="0.9"/><circle cx="3" cy="-2" r="0.9"/><path d="M-4 2.5 Q0 6.5 4 2.5"/>';
  const note = '<path d="M-3 6 V-6 L6 -8 V4"/><circle cx="-5" cy="6" r="2.6"/><circle cx="4" cy="4.5" r="2.6"/>';
  const plane = '<path d="M-9 0 L9 -7 L3 8 L0 2 Z M0 2 L9 -7"/>';
  const cloud = '<path d="M-9 4 A5 5 0 0 1 -6 -4 A7 7 0 0 1 7 -2 A4.5 4.5 0 0 1 7 6 Z"/>';
  const cam = '<rect x="-9" y="-6" width="18" height="12" rx="2.5"/><circle r="3.5"/>';
  const ring = '<circle r="5"/><circle r="1.4"/>';
  const bulb = '<path d="M-4 3 A7 7 0 1 1 4 3 V6 H-4 Z M-2 9 H2"/>';
  return `<pattern id="dd" width="104" height="104" patternUnits="userSpaceOnUse">${g(14, 16, -12, heart)}${g(58, 10, 10, star)}${g(90, 30, 0, smile)}${g(34, 46, 15, note)}${g(74, 62, -20, plane)}${g(10, 76, 8, cloud)}${g(52, 86, 0, cam)}${g(96, 92, 0, ring)}${g(28, 98, 0, bulb)}${g(62, 38, 0, ring)}</pattern>`;
})();

function buildWaInner(text, info = {}, opts = {}) {
  const name = clean(info.name).trim().slice(0, 24) || 'Unknown';
  const tokens = tokenize(String(text).slice(0, 700));
  const showNotice = String(text).length <= 110;
  const areaTop = showNotice ? 212 : 158;
  const boxW = 340; const boxH = 430 - areaTop - 32;
  const { fs, lh, lines: fullLines } = fit(tokens, boxW, boxH, { min: 14, max: 26 });
  // Reveal letter by letter over the FULL layout so words never jump between lines.
  let left = opts.reveal === undefined ? Infinity : opts.reveal;
  const lines = [];
  for (const line of fullLines) {
    if (left <= 0) break;
    const out = [];
    for (const t of line) {
      if (left <= 0) break;
      const n = tokLen(t);
      if (n <= left) { out.push(t); left -= n; } else { out.push({ k: 't', v: [...t.v].slice(0, left).join('') }); left = 0; }
    }
    lines.push(out);
  }
  const lw = lines.map((l) => l.reduce((s2, t) => s2 + tokenWidth(t, fs), 0));
  const maxLine = Math.max(20, ...lw);
  const time = opts.time || info.time || '';
  const timeW = 40;
  const lastW = lw.length ? lw[lw.length - 1] : 0;
  const timeInline = lastW + 8 + timeW <= boxW;
  const padX = 11; const rows = lines.length + (timeInline ? 0 : 0.62);
  const contentW = Math.max(maxLine, timeInline ? lastW + 8 + timeW : timeW + 4, 52);
  const bw = Math.min(380, contentW + padX * 2); const bh = Math.round(rows * lh + 12);
  const bx = 40; const by = areaTop;
  let body = ''; let y = by + 7 + fs * 0.9;
  for (const line of lines) {
    let x = bx + padX;
    for (const t of line) {
      const tw = tokenWidth(t, fs);
      if (t.k === 'e') { const img = info.emojiImages?.[t.v]; if (img) body += `<image x="${x.toFixed(1)}" y="${(y - fs * 0.85).toFixed(1)}" width="${(fs * 1.05).toFixed(1)}" height="${(fs * 1.05).toFixed(1)}" href="${img}"/>`; }
      else if (t.k === 't') body += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" fill="#111b21" xml:space="preserve">${esc(t.v)}</text>`;
      x += tw;
    }
    y += lh;
  }
  const r = 11;
  const bubblePath = `M${bx + r} ${by} H${bx + bw - r} Q${bx + bw} ${by} ${bx + bw} ${by + r} V${by + bh - r} Q${bx + bw} ${by + bh} ${bx + bw - r} ${by + bh} H${bx + r} Q${bx} ${by + bh} ${bx} ${by + bh - r} V${by + 9} L${bx - 9} ${by - 1} Q${bx - 1} ${by - 1} ${bx + 4} ${by + 1} Q${bx + 6} ${by} ${bx + r} ${by} Z`;
  const typingPath = `M${bx + r} ${by} H${bx + 56} Q${bx + 68} ${by} ${bx + 68} ${by + r} V${by + 30} Q${bx + 68} ${by + 42} ${bx + 56} ${by + 42} H${bx + r} Q${bx} ${by + 42} ${bx} ${by + 30} V${by + 9} L${bx - 9} ${by - 1} Q${bx - 1} ${by - 1} ${bx + 4} ${by + 1} Q${bx + 6} ${by} ${bx + r} ${by} Z`;
  const av = info.avatarDataUri
    ? `<image x="50" y="58" width="40" height="40" href="${info.avatarDataUri}" clip-path="url(#avc)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="70" cy="78" r="20" fill="#dfe5e7"/><text x="70" y="85" text-anchor="middle" font-size="17" font-weight="500" fill="#667781">${esc(initials(name))}</text>`;
  const dotsT = opts.typing ? [0, 1, 2].map((i) => `<circle cx="${bx + 20 + i * 14}" cy="${by + 21}" r="4.6" fill="#8696a0" opacity="${opts.dot === i ? 1 : 0.45}"/>`).join('') : '';
  const bubble = opts.typing
    ? `<path d="${typingPath}" fill="#fff" filter="url(#bs)"/>${dotsT}`
    : (lines.length ? `<path d="${bubblePath}" fill="#fff" filter="url(#bs)"/>${body}<text x="${bx + bw - padX + 2}" y="${by + bh - 7}" text-anchor="end" font-size="11.5" fill="#667781">${esc(time)}</text>` : '');
  const ic = '#8696a0';
  const composer = `<rect x="22" y="448" width="404" height="46" rx="23" fill="#fff" filter="url(#bs)"/>
<g fill="none" stroke="${ic}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="471" r="10.5"/><path d="M43 474.5 Q48 480 53 474.5"/><circle cx="44.6" cy="467.6" r="0.6"/><circle cx="51.4" cy="467.6" r="0.6"/>
<g transform="translate(382 471) rotate(40) scale(0.95)"><path d="M5 -7 L-4 3 A3.3 3.3 0 0 0 0.8 7.6 L9 -0.8 A5.6 5.6 0 0 0 1 -8.6 L-6.6 -0.9 A7.4 7.4 0 0 0 3.9 9.6 L8 5.5"/></g><g transform="translate(410 471)"><path d="M-9 -4.5 H-4.5 L-2.6 -7.5 H2.6 L4.5 -4.5 H9 A1.5 1.5 0 0 1 10.5 -3 V6 A1.5 1.5 0 0 1 9 7.5 H-9 A1.5 1.5 0 0 1 -10.5 6 V-3 A1.5 1.5 0 0 1 -9 -4.5 Z"/><circle cx="0" cy="1.4" r="3.8"/></g></g>
<text x="72" y="477" font-size="17" fill="${ic}">Message</text>
<circle cx="458" cy="471" r="24" fill="#00a884"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="453" y="459" width="10" height="16" rx="5" fill="#fff"/><path d="M449 470 Q449 481 458 481 Q467 481 467 470"/><path d="M458 481 V485"/></g>`;
  const statusBar = `<rect x="12" y="12" width="488" height="34" fill="#006b58"/>
<text x="32" y="35" font-size="15" font-weight="500" fill="#fff">${esc(time || '9:41')}</text>
<g fill="#fff"><rect x="404" y="30" width="3.6" height="5" rx="0.8"/><rect x="410" y="27" width="3.6" height="8" rx="0.8"/><rect x="416" y="24" width="3.6" height="11" rx="0.8"/><rect x="422" y="21" width="3.6" height="14" rx="0.8" opacity="0.45"/></g>
<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M434 29 Q441 22 448 29" /><path d="M437 32 Q441 28 445 32"/></g><circle cx="441" cy="35" r="1.6" fill="#fff"/>
<rect x="456" y="22" width="24" height="12" rx="3" fill="none" stroke="#fff" stroke-width="1.6"/><rect x="458.5" y="24.5" width="16" height="7" rx="1.5" fill="#fff"/><rect x="481" y="26" width="2.4" height="4" rx="1" fill="#fff"/>`;
  const headerIcons = `<g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M44 78 H25 M33 69 L24 78 L33 87"/></g>
<g fill="#fff"><rect x="378" y="71" width="19" height="15" rx="3"/><path d="M400 76 L409 71 V86 L400 81 Z"/>
<path d="M430 69 C428 69 426 71 426.6 73.5 C428 80 433 85 439.5 86.5 C442 87 444 85 444 83 V80.5 L439 78.5 L437 80.5 C434.5 79.5 432.5 77.5 431.5 75 L433.5 73 L431.5 69.4 Z"/>
<circle cx="469" cy="70" r="2.3"/><circle cx="469" cy="78" r="2.3"/><circle cx="469" cy="86" r="2.3"/></g>`;
  const notice = showNotice ? `<rect x="56" y="148" width="400" height="48" rx="9" fill="#ffeecd" filter="url(#bs)"/><g fill="#54656f" font-size="11.8" text-anchor="middle"><text x="256" y="168">${esc(NOTICE[0])}</text><text x="256" y="184">${esc(NOTICE[1])}</text></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" font-family="Roboto, Inter, Noto Sans, DejaVu Sans, sans-serif" font-weight="400">
<defs><clipPath id="avc"><circle cx="70" cy="78" r="20"/></clipPath><clipPath id="card"><rect x="12" y="12" width="488" height="488" rx="36"/></clipPath>${DOODLE}
<filter id="bs" x="-5%" y="-5%" width="110%" height="125%"><feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.22"/></filter>
<filter id="cs" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity="0.4"/></filter></defs>
<g filter="url(#cs)"><rect x="12" y="12" width="488" height="488" rx="36" fill="#efeae2"/></g>
<g clip-path="url(#card)"><rect x="12" y="12" width="488" height="488" fill="#efeae2"/><rect x="12" y="46" width="488" height="454" fill="url(#dd)"/>
<rect x="12" y="46" width="488" height="64" fill="#008069"/>${statusBar}
<rect x="226" y="118" width="62" height="24" rx="8" fill="#fff" filter="url(#bs)"/><text x="257" y="135" text-anchor="middle" font-size="12.5" font-weight="500" fill="#54656f">TODAY</text>
${notice}</g>
${headerIcons}${av}
<text x="102" y="${opts.status ? 75 : 84}" font-size="19" font-weight="500" fill="#fff">${esc(name)}</text>
${opts.status ? `<text x="102" y="94" font-size="13" fill="#fff" fill-opacity="0.85">${esc(opts.status)}</text>` : ''}
${bubble}${composer}
</svg>`;
}

async function prep(text, info, opts) {
  const { default: sharp } = await import('sharp');
  const emojiImages = {};
  const uniq = [...new Set(tokenize(String(text).slice(0, 700)).filter((t) => t.k === 'e').map((t) => t.v))].slice(0, 12);
  if (opts.emoji !== false) await Promise.all(uniq.map(async (e) => { const u = await fetchEmoji(e, opts.fetch); if (u) emojiImages[e] = u; }));
  try { setMeasured(await measureChars([...String(text).slice(0, 700)].filter((c) => !/\s/.test(c) || c === ' ').concat([' ']))); } catch { setMeasured(new Map()); }
  return { sharp, emojiImages };
}

/** Static WhatsApp-look sticker. */
export async function renderWaSticker(text, info = {}, opts = {}) {
  const { sharp, emojiImages } = await prep(text, info, opts);
  const svg = buildWaSvg(text, { ...info, emojiImages }, { status: info.status || 'online', time: info.time || '' });
  return sharp(Buffer.from(svg)).resize(SIZE, SIZE).webp({ quality: 88 }).toBuffer();
}

const MAX_BYTES = 880 * 1024; // WhatsApp rejects/degrades animated stickers near 1 MB
async function toAnimated(sharp, frames, delays, quality = 95) {
  // Render at 2x then downscale with Lanczos: sharper text/edges than a direct 512 render.
  const pngs = [];
  for (const svg of frames) pngs.push(await sharp(Buffer.from(svg), { density: 144 }).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toBuffer());
  let out = null;
  for (const o of [{ lossless: true }, { quality: 100, smartSubsample: false }, { quality: 95 }, { quality: 90 }, { quality: 82 }, { quality: 72 }, { quality: 60 }]) {
    out = await sharp(pngs, { join: { animated: true } }).webp({ ...o, effort: 4, loop: 0, delay: delays, alphaQuality: 100 }).toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  return out;
}

/** Animated "live chat": typing dots, then the message types out LETTER by LETTER, ends with ticks. */
export async function renderLiveSticker(text, info = {}, opts = {}) {
  const { sharp, emojiImages } = await prep(text, info, opts);
  const I = { ...info, emojiImages };
  const total = Math.max(1, waCharCount(text));
  const step = Math.max(1, Math.ceil(total / 48)); // keeps the sticker under WhatsApp's size limit; short texts get exactly one letter per frame
  const per = total <= 48 ? 110 : Math.max(50, Math.round(5200 / Math.ceil(total / step)));
  const final = info.status || 'online';
  const frames = []; const delays = [];
  const add = (o, d) => { frames.push(buildWaSvg(text, I, o)); delays.push(d); };
  add({ status: final && !/^typing/.test(final) ? final : 'online' }, 500);
  add({ status: 'typing...', typing: true, dot: 0 }, 300); add({ status: 'typing...', typing: true, dot: 1 }, 300); add({ status: 'typing...', typing: true, dot: 2 }, 300);
  for (let n = step; n < total + step; n += step) add({ status: 'typing...', reveal: Math.min(n, total), time: info.time || '' }, per);
  add({ status: final, time: info.time || '' }, 500);
  add({ status: final, time: info.time || '' }, 3500);
  return toAnimated(sharp, frames, delays, opts.quality || 95);
}

/** Animated version of the default gradient design: words appear one by one. */
export async function renderAnimSticker(text, info = {}, opts = {}) {
  const { sharp, emojiImages } = await prep(text, info, opts);
  const total = countWords(text); const steps = Math.min(8, Math.max(1, total));
  const frames = []; const delays = [];
  for (let i = 1; i <= steps; i++) { frames.push(buildSvg(text, { ...info, emojiImages, revealWords: Math.ceil(total * i / steps) })); delays.push(i === steps ? 3000 : 400); }
  return toAnimated(sharp, frames, delays, opts.quality || 88);
}
