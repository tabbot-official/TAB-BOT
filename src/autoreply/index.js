import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {askAi} from '../ai/providers.js';
import {styledPrompt, cleanSample, isRisky, tidyReply, TAG} from './style.js';

export const DEFAULT_MESSAGE = 'Hi! The owner is busy right now and will reply to you as soon as possible. Thank you for your patience. 🙏';
const COOLDOWN_MS = 30 * 60 * 1000;
const HOURLY_CAP = 40;
const file = () => path.join(config.paths.data, 'autoreply.json');
let state = null;
const seen = new Map();
let stamps = [];

function load() {
  if (state) return state;
  state = { enabled: false, message: '', style: false, learn: false, tag: true, samples: [] };
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); state = { enabled: j.enabled === true, message: typeof j.message === 'string' ? j.message.slice(0, 500) : '', style: j.style === true, learn: j.learn === true, tag: j.tag !== false, samples: Array.isArray(j.samples) ? j.samples.filter((x) => typeof x === 'string').slice(-40) : [] }; } catch { /* default off */ }
  return state;
}
function save() { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(state)); fs.renameSync(file() + '.tmp', file()); }

export const getState = () => ({ ...load(), text: load().message || DEFAULT_MESSAGE });
export function setEnabled(v) { load().enabled = !!v; save(); }
export function setMessage(m) { load().message = String(m || '').trim().slice(0, 500); save(); }
export function setStyle(k, v) { load()[k] = !!v; save(); }
export function addSample(t) { const c = cleanSample(t); if (!c) return false; const st = load(); st.samples = [...st.samples.filter((x) => x !== c), c].slice(-40); save(); return true; }
export function clearSamples() { load().samples = []; save(); }
export const samples = () => [...load().samples];
const sty = new Map();
export function _reset() { state = null; seen.clear(); sty.clear(); stamps = []; }

const num = (j) => String(j || '').split('@')[0].split(':')[0];
function inner(message) {
  return message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.documentWithCaptionMessage?.message || message || {};
}
function contextOf(message) {
  const m = inner(message);
  for (const v of Object.values(m)) if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  return {};
}

/** True when this message is addressed to the owner: any DM, or a group mention/reply of the owner. */
export function addressedToOwner({ kind, message, ownerIds }) {
  if (kind === 'private') return true;
  if (kind !== 'group') return false;
  const ci = contextOf(message);
  const ids = new Set(ownerIds.map(num).filter(Boolean));
  return (ci.mentionedJid || []).some((j) => ids.has(num(j))) || (ci.participant ? ids.has(num(ci.participant)) : false);
}

const looksAutomated = (msg) => {
  const id = String(msg.key?.id || '');
  const m = inner(msg.message);
  return id.startsWith('BAE5') || !!(m.protocolMessage || m.reactionMessage || m.pollUpdateMessage);
};

/**
 * Sends one auto reply when enabled. Returns true if a reply was sent.
 * Caller passes only messages that are not commands and not from the owner.
 */
export async function maybeAutoReply(sock, msg, kind, text, now = Date.now()) {
  try {
    const st = load();
    if (st.learn && msg.key.fromMe && kind === 'private' && !looksAutomated(msg) && !/^[\/.!#]/.test(text || '')) { addSample(text); return false; }
    if (!st.enabled || msg.key.fromMe) return false;
    if (/^[\/.!#]/.test(text || '')) return false;
    if (looksAutomated(msg)) return false;
    const ownerIds = [config.ownerNumber, sock.user?.id, sock.user?.lid].filter(Boolean);
    const sender = kind === 'group' ? msg.key.participantAlt || msg.key.participant : msg.key.remoteJidAlt || msg.key.remoteJid;
    if (ownerIds.some((o) => num(o) === num(sender))) return false;
    if (!addressedToOwner({ kind, message: msg.message, ownerIds })) return false;
    const k = msg.key.remoteJid + '|' + num(sender);
    if (st.style && st.samples.length >= 3 && !isRisky(text)) {
      const a = (sty.get(k) || []).filter((t) => now - t < 3600000);
      stamps = stamps.filter((t) => now - t < 3600000);
      if (a.length >= 6 || stamps.length >= HOURLY_CAP || (a.length && now - a[a.length - 1] < 20000)) return false;
      try {
        const r = await askAi(styledPrompt(st.samples, text));
        const out = tidyReply(r.text, st.tag);
        if (out) { sty.set(k, [...a, now]); stamps.push(now); if (sty.size > 3000) sty.clear(); await sock.sendMessage(msg.key.remoteJid, { text: out }, { quoted: msg }); return true; }
      } catch { /* fall back to the plain message below */ }
    }
    if (now - (seen.get(k) || 0) < COOLDOWN_MS) return false;
    stamps = stamps.filter((t) => now - t < 3600000);
    if (stamps.length >= HOURLY_CAP) return false;
    seen.set(k, now); stamps.push(now);
    if (seen.size > 3000) seen.clear();
    await sock.sendMessage(msg.key.remoteJid, { text: st.message || DEFAULT_MESSAGE }, { quoted: msg });
    return true;
  } catch (err) { logger.warn('autoreply failed: ' + (err?.message || 'error')); return false; }
}
