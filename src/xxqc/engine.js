// /xxqc design engine: text + sender info -> 512x512 WebP sticker. No secrets, no network except optional Apple-style emoji (emoji-datasource-apple on free jsDelivr CDN, Twemoji fallback, cached).
import { fileURLToPath } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// iOS-like text: bundle Inter (OFL, SF-like) and point fontconfig at it, keeping system fonts as fallback for other scripts.
try {
  const fdir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
  if (existsSync(fdir) && !process.env.FONTCONFIG_FILE) {
    const conf = path.join(tmpdir(), 'jarvis-fonts.conf');
    writeFileSync(conf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>${fdir}</dir><cachedir>${path.join(tmpdir(), 'jarvis-fc-cache')}</cachedir></fontconfig>`);
    process.env.FONTCONFIG_FILE = conf;
  }
} catch {}
const SIZE = 512;
const PALETTES = [
  ['#7F00FF', '#E100FF', '#FFD1FF'], ['#0F2027', '#2C5364', '#7DE2FC'], ['#F7971E', '#FF512F', '#FFE29F'],
  ['#11998E', '#38EF7D', '#E0FFF0'], ['#232526', '#414345', '#FFD700'], ['#FC466B', '#3F5EFB', '#FFE1F0'],
  ['#00C6FF', '#0072FF', '#DFF6FF'], ['#1D2671', '#C33764', '#FFD6E8'],
];
const EMOJI_RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export const clean = (s) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');

export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function palette(seed) { return PALETTES[hashStr(seed) % PALETTES.length]; }

/** Split text into tokens: {k:'t'|'e'|'nl'|'sp', v}. */
export function tokenize(text) {
  const out = [];
  for (const line of clean(text).split('\n')) {
    let last = 0;
    const pushText = (seg) => { for (const part of seg.split(/( )/)) { if (part === ' ') out.push({ k: 'sp', v: ' ' }); else if (part) out.push({ k: 't', v: part }); } };
    for (const m of line.matchAll(EMOJI_RE)) { pushText(line.slice(last, m.index)); out.push({ k: 'e', v: m[0] }); last = m.index + m[0].length; }
    pushText(line.slice(last)); out.push({ k: 'nl', v: '\n' });
  }
  out.pop();
  return out;
}

const cp = (ch) => ch.codePointAt(0);
const isWide = (ch) => { const c = cp(ch); return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60); };
/** Estimated advance width of a token in px at font size fs (bold sans). */
let MEASURED = new Map();
export const setMeasured = (m) => { MEASURED = m; };
let WSCALE = 1;
export const setWidthScale = (k) => { WSCALE = k; };
export function tokenWidth(tok, fs) {
  return tokenWidthRaw(tok, fs) * WSCALE;
}
function tokenWidthRaw(tok, fs) {
  if (tok.k === 'e') return fs * 1.1;
  if (tok.k === 'sp') return fs * (MEASURED.get(' ') ?? 0.3) * 1.04;
  let w = 0;
  for (const ch of tok.v) w += MEASURED.get(ch) ?? (isWide(ch) ? 1.05 : /[A-Z0-9MW@#%&]/.test(ch) ? 0.80 : /[il.,'|!:;ij]/.test(ch) ? 0.34 : 0.66);
  return w * fs * 1.04;
}

/** Measure real glyph advances (em) with the same font the SVG uses. */
export async function measureChars(chars) {
  const { default: sharp } = await import('sharp');
  const m = new Map();
  const wOf = async (t) => { try { return (await sharp({ text: { text: `<span font_weight="normal">${esc(t)}</span>`, font: 'Roboto 100', rgba: true, dpi: 72 } }).metadata()).width; } catch { return null; } };
  const base = await wOf('||'); // reference for ink/padding
  for (const ch of new Set(chars)) {
    if (ch === ' ') { const a = await wOf('x x'); const b = await wOf('xx'); if (a && b) m.set(' ', Math.max(0.15, (a - b) / 100)); continue; }
    const w = await wOf('|' + ch + '|'); if (w && base) m.set(ch, Math.max(0.05, (w - base) / 100));
  }
  void base;
  return m;
}

/** Wrap tokens into lines no wider than maxW; very long words are split by character. */
export function wrap(tokens, fs, maxW) {
  const lines = []; let cur = []; let w = 0;
  const flush = () => { while (cur.length && cur[cur.length - 1].k === 'sp') cur.pop(); lines.push(cur); cur = []; w = 0; };
  for (const tok of tokens) {
    if (tok.k === 'nl') { flush(); continue; }
    if (tok.k === 'sp' && !cur.length) continue;
    const tw = tokenWidth(tok, fs);
    if (tw > maxW && tok.k === 't') {
      for (const ch of tok.v) { const cw = tokenWidth({ k: 't', v: ch }, fs); if (w + cw > maxW) flush(); cur.push({ k: 't', v: ch }); w += cw; }
      continue;
    }
    if (w + tw > maxW && cur.length) flush();
    if (tok.k === 'sp' && !cur.length) continue;
    cur.push(tok); w += tw;
  }
  if (cur.length || !lines.length) flush();
  return lines;
}

/** Largest font size that fits the box. */
export function fit(tokens, boxW, boxH, { min = 16, max = 68 } = {}) {
  for (let fs = max; fs >= min; fs -= 2) {
    const lines = wrap(tokens, fs, boxW); const lh = fs * 1.22;
    if (lines.length * lh <= boxH) return { fs, lines, lh, truncated: false };
  }
  const fs = min; const lh = fs * 1.22; const all = wrap(tokens, fs, boxW); const n = Math.max(1, Math.floor(boxH / lh));
  const lines = all.slice(0, n);
  if (all.length > n) { const last = lines[n - 1]; while (last.length && wrap([...last, { k: 't', v: '…' }], fs, boxW).length > 1) last.pop(); last.push({ k: 't', v: '…' }); }
  return { fs, lines, lh, truncated: all.length > n };
}

export const maskNumber = (num) => { const d = String(num || '').replace(/\D/g, ''); return d.length < 7 ? '' : `+${d.slice(0, 2)}••••••${d.slice(-2)}`; };
export const initials = (name) => { const p = [...String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean)]; return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase(); };
export const emojiFile = (e) => [...e].map((c) => cp(c).toString(16)).filter((h) => h !== 'fe0f' || [...e].length === 1).join('-');

/**
 * Build the SVG. info: {name, number, username, time, brand, avatarDataUri, emojiImages:{[emoji]:dataUri}}
 */
export function countWords(text) { return tokenize(String(text).slice(0, 700)).filter((t) => t.k === 't' || t.k === 'e').length; }
export function buildSvg(text, info = {}) {
  const name = clean(info.name).trim().slice(0, 28) || 'Unknown';
  const [c1, c2, acc] = palette(info.seed || name);
  const tokens = tokenize(String(text).slice(0, 700));
  const padX = 44; const headerH = 104; const footerH = info.brand ? 40 : 24;
  const boxW = SIZE - padX * 2 - 8; const boxY = 40 + headerH + 12; const boxH = SIZE - boxY - footerH - 28;
  const { fs, lines, lh } = fit(tokens, boxW, boxH);
  const plainLen = tokens.reduce((n, t) => n + (t.v || '').length, 0);
  const center = lines.length <= 2 && plainLen <= 40;
  const blockH = lines.length * lh; let y = boxY + Math.max(0, (boxH - blockH) / 2) + fs * 0.86;
  let body = ''; let shown = 0; const lim = info.revealWords ?? Infinity;
  for (const line0 of lines) {
    const line = line0.filter((t) => { if (t.k === 't' || t.k === 'e') { shown++; return shown <= lim; } return shown <= lim; });
    const full = line0;
    const w = full.reduce((s, t) => s + tokenWidth(t, fs), 0);
    let x = center ? (SIZE - w) / 2 : padX;
    if (!line.length) { y += lh; continue; }
    const hasEmoji = line.some((t) => t.k === 'e');
    if (!hasEmoji) {
      const txt = line.map((t) => t.v).join('');
      const rv = info.revealWords !== undefined;
      const ax = rv ? x : (center ? SIZE / 2 : padX);
      body += `<text x="${ax}" y="${y.toFixed(1)}" text-anchor="${(center && !rv) ? 'middle' : 'start'}" font-size="${fs}" fill="#fff" stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(1.5, fs / 14).toFixed(1)}" paint-order="stroke" filter="url(#sh)" xml:space="preserve">${esc(txt)}</text>`;
    } else {
      for (const t of line) {
        const tw = tokenWidth(t, fs);
        if (t.k === 'e') { const img = info.emojiImages?.[t.v]; if (img) body += `<image x="${x.toFixed(1)}" y="${(y - fs * 0.85).toFixed(1)}" width="${(fs * 1.05).toFixed(1)}" height="${(fs * 1.05).toFixed(1)}" href="${img}"/>`; }
        else if (t.k === 't') body += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" fill="#fff" stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(1.5, fs / 14).toFixed(1)}" paint-order="stroke" filter="url(#sh)">${esc(t.v)}</text>`;
        x += tw;
      }
    }
    y += lh;
  }
  const av = info.avatarDataUri
    ? `<image x="44" y="40" width="88" height="88" href="${info.avatarDataUri}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="88" cy="84" r="44" fill="url(#ag)"/>${/^\p{L}/u.test(name) && name !== 'WhatsApp User' ? `<text x="88" y="100" text-anchor="middle" font-size="40" fill="#fff">${esc(initials(name))}</text>` : '<circle cx="88" cy="74" r="15" fill="#fff" fill-opacity="0.92"/><path d="M58 118 C58 96 72 90 88 90 C104 90 118 96 118 118 Z" fill="#fff" fill-opacity="0.92"/>'}`;
  const sub = [info.username ? '@' + clean(info.username).replace(/^@/, '').slice(0, 20) : '', (info.number && !/•/.test(name) && !/^\+?\d/.test(name)) ? maskNumber(info.number) : '', info.time || ''].filter(Boolean).join('  ·  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" font-family="Roboto, Inter, Noto Sans, DejaVu Sans, sans-serif" font-weight="700">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="ag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${acc}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="gl" cx="0.2" cy="0.1" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<clipPath id="av"><circle cx="88" cy="84" r="42"/></clipPath>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/></filter>
<filter id="cs" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.45"/></filter>
</defs>
<g filter="url(#cs)"><rect x="12" y="12" width="488" height="488" rx="44" fill="url(#bg)"/></g>
<rect x="12" y="12" width="488" height="488" rx="44" fill="url(#gl)"/>
<circle cx="440" cy="450" r="110" fill="${acc}" opacity="0.14"/><circle cx="470" cy="60" r="60" fill="#fff" opacity="0.08"/><circle cx="30" cy="470" r="70" fill="#000" opacity="0.10"/>
<rect x="12" y="12" width="488" height="488" rx="44" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3"/>
<circle cx="88" cy="84" r="46" fill="none" stroke="${acc}" stroke-width="5"/>${av}
<text x="150" y="${sub ? 76 : 92}" font-size="30" fill="#fff" filter="url(#sh)">${esc(name)}</text>
${sub ? `<text x="150" y="108" font-size="19" font-weight="400" fill="#fff" fill-opacity="0.82">${esc(sub)}</text>` : ''}
<rect x="44" y="150" width="${SIZE - 88}" height="3" rx="1.5" fill="${acc}" opacity="0.7"/>
${body}
${info.brand ? `<text x="${SIZE - 44}" y="${SIZE - 34}" text-anchor="end" font-size="17" fill="#fff" fill-opacity="0.75">${esc(clean(info.brand).slice(0, 30))}</text>` : ''}
</svg>`;
}

export async function circleAvatar(buf) {
  const { default: sharp } = await import('sharp');
  return `data:image/png;base64,${(await sharp(buf).resize(192, 192, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer()).toString('base64')}`;
}

const emojiCache = new Map();
const appleFile = (e) => [...e].map((c) => cp(c).toString(16)).join('-');
async function getPng(url, fetchImpl) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('http ' + r.status);
  return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}
export async function fetchEmoji(e, fetchImpl = globalThis.fetch) {
  if (emojiCache.has(e)) return emojiCache.get(e);
  const urls = [...new Set([appleFile(e), emojiFile(e)])].map((f) => `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@latest/img/apple/64/${f}.png`);
  urls.push(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${emojiFile(e)}.png`);
  let uri = null;
  for (const u of urls) { try { uri = await getPng(u, fetchImpl); break; } catch { /* next source */ } }
  if (emojiCache.size > 300) emojiCache.clear();
  emojiCache.set(e, uri); return uri;
}

export async function renderSticker(text, info = {}, opts = {}) {
  const { default: sharp } = await import('sharp');
  const emojiImages = {};
  const uniq = [...new Set(tokenize(String(text).slice(0, 700)).filter((t) => t.k === 'e').map((t) => t.v))].slice(0, 12);
  if (opts.emoji !== false) await Promise.all(uniq.map(async (e) => { const u = await fetchEmoji(e, opts.fetch); if (u) emojiImages[e] = u; }));
  try { setMeasured(await measureChars([...String(text).slice(0, 700)].filter((c) => !/\s/.test(c) || c === ' ').concat([' ']))); } catch { setMeasured(new Map()); }
  const svg = buildSvg(text, { ...info, emojiImages });
  return sharp(Buffer.from(svg)).resize(SIZE, SIZE).webp({ quality: 88 }).toBuffer();
}
