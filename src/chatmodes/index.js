// Per-chat modes: sticky AI chat (/chat) and auto-translate (/autotranslate). State is small and saved to data/chatmodes.json.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { askAi, geminiTranslate } from '../ai/providers.js';
import { recall, remember, forget, withContext } from '../ai/chatMemory.js';
import { key as akiKey, active as akiActive, turn as akiTurn } from '../akinator/index.js';

const file = () => path.join(config.paths.data, 'chatmodes.json');
let state = null; // jid -> { chat?:true, tr?:'English' }
const load = () => {
  if (state) return state;
  state = {};
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); for (const [k, v] of Object.entries(j)) if (/^[\w.:@-]{3,80}$/.test(k) && v && typeof v === 'object') state[k] = { ...(v.chat === true ? { chat: true } : {}), ...(typeof v.tr === 'string' ? { tr: v.tr.slice(0, 30) } : {}) }; } catch { /* none yet */ }
  return state;
};
const save = () => { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(state)); fs.renameSync(file() + '.tmp', file()); } catch (e) { logger.warn('chatmodes save failed'); } };
export const getMode = (jid) => ({ ...(load()[jid] || {}) });
export function setChat(jid, on) { const s = load(); const m = { ...(s[jid] || {}) }; if (on) m.chat = true; else delete m.chat; if (Object.keys(m).length) s[jid] = m; else delete s[jid]; save(); }
export function setTranslate(jid, lang) { const s = load(); const m = { ...(s[jid] || {}) }; if (lang) m.tr = lang; else delete m.tr; if (Object.keys(m).length) s[jid] = m; else delete s[jid]; save(); }
export function _reset() { state = null; stamps.clear(); }

const stamps = new Map(); // key -> number[]
function allow(key, perMin, perHour, now = Date.now()) {
  const a = (stamps.get(key) || []).filter((t) => now - t < 3600000);
  if (a.filter((t) => now - t < 60000).length >= perMin || a.length >= perHour) return false;
  a.push(now); stamps.set(key, a);
  if (stamps.size > 3000) stamps.delete(stamps.keys().next().value);
  return true;
}
const num = (j) => String(j || '').split('@')[0].split(':')[0];
function ctxInfo(message) {
  const m = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
  for (const v of Object.values(m)) if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  return {};
}
/** In groups the AI only answers when the bot is mentioned, replied to, or called by name. */
export function addressedToBot(sock, msg, text) {
  const ci = ctxInfo(msg.message);
  const mine = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
  if ((ci.mentionedJid || []).some((j) => mine.includes(num(j)))) return true;
  if (ci.participant && mine.includes(num(ci.participant))) return true;
  const name = String(config.botName || 'tab').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Short names like "tab" are everyday words (Hindi "tab" = "then"), so they need "@tab" or "hey/hi/ok tab" to count as a call.
  if (name.length <= 3) return new RegExp('^\\s*(@' + name + '|(hey|hi|ok)\\s+' + name + ')\\b', 'i').test(text);
  return new RegExp('^\\s*@?(hey\\s+|hi\\s+|ok\\s+)?' + name + '\\b', 'i').test(text);
}

const SAME = 'SAME';
/** Returns the translation, or null when the text is already in the target language or not worth translating. */
export async function translateIfForeign(text, to, tr = geminiTranslate) {
  if (!/\p{L}{2,}/u.test(text)) return null;
  if (/^(https?:\/\/\S+\s*)+$/i.test(text.trim())) return null;
  const r = await tr(text.slice(0, 1200), to, { note: `If the text is already in ${to}, or is only names, numbers, emoji, links or laughter, reply with exactly ${SAME} and nothing else. Output only the translation.` });
  const out = String(r.text || '').trim();
  if (!out || out.toUpperCase() === SAME || out.toLowerCase() === text.trim().toLowerCase()) return null;
  return out;
}

/** Called for plain (non-command) messages. Returns true when it handled the message. */
export async function maybeChatMode(sock, msg, kind, text, deps = {}) {
  try {
    if (!msg.key.fromMe) {
      const ids = kind === 'group' ? [msg.key.participant, msg.key.participantAlt] : [msg.key.remoteJid, msg.key.remoteJidAlt];
      const k = ids.filter(Boolean).map((u) => akiKey(msg.key.remoteJid, u)).find((x) => akiActive(x));
      if (k) { const r = await akiTurn(k, text); if (r) { await sock.sendMessage(msg.key.remoteJid, { text: r.text }, { quoted: msg }); return true; } }
    }
    if (!text || text.length > 1500 || kind === 'self') return false;
    const jid = msg.key.remoteJid;
    const m = load()[jid];
    if (!m) return false;
    const who = String(msg.key.participantAlt || msg.key.participant || msg.key.remoteJidAlt || jid);
    if (m.tr && allow('tr|' + jid, 12, 240)) {
      try {
        const out = await translateIfForeign(text, m.tr, deps.translate);
        if (out) await sock.sendMessage(jid, { text: `🌐 *→ ${m.tr}*\n${out.slice(0, 3000)}` }, { quoted: msg });
      } catch (e) { logger.warn('[autotranslate] failed: ' + String(e?.message || '').slice(0, 80)); }
    }
    if (m.chat && (kind === 'private' || addressedToBot(sock, msg, text)) && allow('chat|' + jid, 8, 120) && allow('chatu|' + who, 4, 60)) {
      try {
        const q = text.replace(/^\s*@?\d{5,}\s*/, '').slice(0, 1500);
        await sock.sendPresenceUpdate?.('composing', jid).catch?.(() => {});
        const r = await (deps.ask || askAi)(withContext(recall(jid, who), q));
        remember(jid, who, q, r.text);
        await sock.sendMessage(jid, { text: String(r.text).slice(0, 3500) }, { quoted: msg });
        return true;
      } catch (e) { logger.warn('[chatmode] failed: ' + String(e?.message || '').slice(0, 80)); }
    }
    return false;
  } catch (e) { logger.warn('[chatmodes] error'); return false; }
}
export const clearChatMemory = (jid) => { try { for (const k of ['', jid]) forget(jid, k); } catch { /* ignore */ } };
