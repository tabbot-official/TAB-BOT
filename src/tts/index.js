// Text to speech, independent of the WhatsApp connection.
// To add a provider: create src/tts/providers/<name>.js with { name, available(), supports(lang, voice), synth({text, lang, voice, timeoutMs}) -> { buf, ext } }
// and register it below. To add a voice or language: edit voices.js.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { LANGS, NAMED, detectLang } from './voices.js';
import edge from './providers/edge.js';
import google from './providers/google.js';

export const LIMITS = { maxChars: Number(process.env.TTS_MAX_CHARS) || 500, timeoutMs: Number(process.env.TTS_TIMEOUT_MS) || 25_000, perWindow: 5, windowMs: 60_000, concurrent: 2 };
const providers = [edge, google];
export const registerProvider = (p, first = false) => (first ? providers.unshift(p) : providers.push(p));
export const providerNames = () => providers.map((p) => p.name);

export class TtsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Splits "/tts hi Namaste" style input into { lang, voice, text }. */
export function parseRequest(args, quotedText = '') {
  const a = [...args];
  let lang = null;
  let voice = null;
  let gender = null;
  const first = (a[0] || '').toLowerCase();
  if (a.length > 1 && (LANGS[first] || /^[a-z]{2}-[A-Z]{2}$/.test(a[0]))) {
    lang = LANGS[first] ? first : a[0].slice(0, 2).toLowerCase();
    if (!LANGS[lang]) lang = null;
    if (lang) a.shift();
  }
  const second = (a[0] || '').toLowerCase();
  if (a.length > 1 && (second === 'male' || second === 'female')) { gender = second; a.shift(); }
  else if (a.length > 1 && NAMED[second]) { voice = NAMED[second]; a.shift(); }
  else if (a.length > 1 && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(a[0])) { voice = a.shift(); }
  const text = (a.join(' ') || quotedText || '').replace(/\s+/g, ' ').trim();
  if (voice && !lang) lang = voice.slice(0, 2).toLowerCase();
  return { lang, voice, gender, text };
}

export function validate(text) {
  if (!text) throw new TtsError('empty', 'Write some text after the command.');
  if (!/[\p{L}\p{N}]/u.test(text)) throw new TtsError('empty', 'There is nothing to read in that text.');
  if (text.length > LIMITS.maxChars) throw new TtsError('long', `That text is too long (${text.length} characters). The limit is ${LIMITS.maxChars}.`);
}

const hits = new Map();
export function rateCheck(user, now = Date.now()) {
  const list = (hits.get(user) || []).filter((t) => now - t < LIMITS.windowMs);
  if (list.length >= LIMITS.perWindow) {
    hits.set(user, list);
    return Math.ceil((LIMITS.windowMs - (now - list[0])) / 1000);
  }
  list.push(now);
  hits.set(user, list);
  if (hits.size > 2000) hits.clear();
  return 0;
}

let active = 0;

function toOpus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.tools.ffmpeg, ['-y', '-i', inputPath, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', outputPath], { stdio: 'ignore' });
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('convert timeout')); }, 20_000);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)); });
  });
}

/**
 * Makes a voice note. Returns { buf, mimetype, ptt, lang, voice, provider } and always deletes its temp files.
 * `send(result)` is not needed: the caller sends the buffer.
 */
export async function speak({ text, lang, voice, gender }) {
  validate(text);
  const language = lang || detectLang(text);
  const L = LANGS[language];
  if (!L) throw new TtsError('lang', `I do not have that language. Send ${config.prefix}ttsvoices to see the list.`);
  const chosen = voice || (gender === 'male' ? L.male : L.female) || L.female || L.male || null;
  if (active >= LIMITS.concurrent) throw new TtsError('busy', 'I am making other voice notes right now. Try again in a few seconds.');
  active++;
  const id = crypto.randomBytes(5).toString('hex');
  await fs.mkdir(config.paths.temp, { recursive: true });
  const rawPath = path.join(config.paths.temp, `tts-${id}.in`);
  const outPath = path.join(config.paths.temp, `tts-${id}.ogg`);
  try {
    let audio = null;
    let used = null;
    let lastErr = null;
    for (const p of providers) {
      try {
        if (!(await p.available()) || !p.supports(L.google, chosen)) continue;
        audio = await p.synth({ text, lang: L.google, voice: chosen, timeoutMs: LIMITS.timeoutMs });
        used = p.name;
        break;
      } catch (err) {
        lastErr = err;
        logger.warn(`[tts] ${p.name} failed: ${String(err.message).slice(0, 80)}`);
      }
    }
    if (!audio) throw new TtsError('provider', /timeout/i.test(lastErr?.message || '') ? 'The voice service took too long. Try again in a moment.' : 'The voice service is not answering right now. Try again in a moment.');
    await fs.writeFile(rawPath, audio.buf);
    try {
      await toOpus(rawPath, outPath);
      const buf = await fs.readFile(outPath);
      return { buf, mimetype: 'audio/ogg; codecs=opus', ptt: true, lang: language, voice: used === 'edge' ? chosen : null, provider: used };
    } catch (err) {
      logger.warn(`[tts] voice-note convert failed (${err.message}), sending plain audio`);
      return { buf: audio.buf, mimetype: 'audio/mpeg', ptt: false, lang: language, voice: used === 'edge' ? chosen : null, provider: used };
    }
  } finally {
    active--;
    await Promise.all([fs.rm(rawPath, { force: true }), fs.rm(outPath, { force: true })]);
  }
}
