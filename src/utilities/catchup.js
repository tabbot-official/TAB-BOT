// Offline command catch-up: remembers commands that arrived while Tab was
// offline (or too old for the live gate) and runs them on reconnect.
// Honest limits: WhatsApp only redelivers messages for a limited time and a new
// pairing's history sync may not include everything sent while unlinked - those
// are unrecoverable. The owner /queue survives anything because it lives on disk.
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { TinyJson } from '../subs/tinyjson.js';

const OTHER_MAX_AGE_S = 12 * 3600;       // other users: only catch up 12h
const OTHER_DL_MAX_AGE_S = 2 * 3600;     // other users: no stale heavy downloads
const MAX_QUEUE = 50, MAX_DONE = 500, MAX_TEXT = 200;
const HEAVY = new Set(['play', 'song', 'audio', 'video', 'ytmp3', 'ytmp4', 'dl', 'download', 'tiktok', 'insta', 'instagram', 'fb', 'facebook', 'pinterest', 'apk', 'spotify']);

let store = null;
function st() {
  if (!store) store = new TinyJson(path.join(config.paths.data, 'catchup.json'), { done: {}, queue: [] });
  if (!store.data.done) store.data.done = {};
  if (!store.data.queue) store.data.queue = [];
  return store;
}

function textOf(msg) {
  const m = msg?.message?.ephemeralMessage?.message || msg?.message || {};
  return (m.conversation || m.extendedTextMessage?.text || '').trim();
}
function numOf(jid = '') { return String(jid).split('@')[0].split(':')[0]; }
function isOwnerMsg(msg) {
  const owner = numOf(config.ownerNumber || '');
  if (!owner) return false;
  return [msg.key?.participant, msg.key?.participantAlt, msg.key?.remoteJid, msg.key?.remoteJidAlt].some((j) => j && numOf(j) === owner);
}

export function markDone(id) {
  if (!id) return;
  const d = st().data;
  d.done[id] = Date.now();
  const keys = Object.keys(d.done);
  if (keys.length > MAX_DONE) for (const k of keys.slice(0, keys.length - MAX_DONE)) delete d.done[k];
  st().save();
}
export const isDone = (id) => !!id && !!st().data.done[id];

/** Called for messages the live path would drop (offline backlog / aged out). Queues owner + fresh-enough commands. */
export function consider(msg) {
  try {
    if (!msg?.key || msg.key.fromMe) return;
    const text = textOf(msg);
    if (!text.startsWith(config.prefix)) return;
    if (text.length > MAX_TEXT) return;
    const id = msg.key.id;
    if (isDone(id)) return;
    if (st().data.queue.some((q) => q.id === id)) return;
    const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0);
    const age = ts ? Date.now() / 1000 - ts : 0;
    const owner = isOwnerMsg(msg);
    if (!owner && age > OTHER_MAX_AGE_S) return;
    const cmd = text.slice(config.prefix.length).trim().split(/\s+/)[0].toLowerCase();
    if (!owner && HEAVY.has(cmd) && age > OTHER_DL_MAX_AGE_S) return; // stale heavy download from a non-owner: skip
    const d = st().data;
    if (d.queue.length >= MAX_QUEUE) d.queue.shift();
    d.queue.push({ id, jid: msg.key.remoteJid, text, ts, owner, at: Date.now() });
    st().save();
    logger.info(`[catchup] queued missed command ${text.slice(0, 40)} (age ${Math.round(age / 60)}m, owner=${owner})`);
  } catch (e) { logger.warn('[catchup] consider failed: ' + (e?.message || 'error')); }
}

/** Owner /queue: manual commands that run whenever Tab is online. Survives restarts and re-pairs. */
export function enqueue(text) {
  const d = st().data;
  if (d.queue.length >= MAX_QUEUE) return false;
  d.queue.push({ id: 'manual-' + Date.now(), jid: null, text, ts: Math.floor(Date.now() / 1000), owner: true, manual: true, at: Date.now() });
  st().save();
  return true;
}
export const listQueue = () => st().data.queue.slice();
export function clearQueue() { st().data.queue = []; st().save(); }

let draining = false;
/** Runs queued commands one by one. Called on connect; also manually via /queue run. */
export async function drain(sock, handleMessage) {
  if (draining) return 0;
  draining = true;
  let ran = 0;
  try {
    for (;;) {
      const item = st().data.queue[0];
      if (!item) break;
      const jid = item.jid || (config.ownerNumber ? numOf(config.ownerNumber) + '@s.whatsapp.net' : null);
      if (!jid) { st().data.queue.shift(); st().save(); continue; }
      if (item.id) markDone(item.id);
      try {
        await sock.sendMessage(jid, { text: '⏪ I was offline. Running your missed command: ' + item.text.slice(0, 120) });
      } catch { /* chat may be gone - still try the command */ }
      const msg = {
        key: { remoteJid: jid, id: item.id || ('catchup-' + Date.now()), fromMe: false, participant: item.jid?.endsWith('@g.us') ? (config.ownerNumber ? numOf(config.ownerNumber) + '@s.whatsapp.net' : undefined) : undefined },
        message: { conversation: item.text },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'catch-up',
      };
      try { await handleMessage(sock, msg); ran++; }
      catch (e) { logger.warn('[catchup] run failed for ' + item.text.slice(0, 40) + ': ' + (e?.message || 'error')); }
      st().data.queue.shift(); st().save();
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally { draining = false; }
  return ran;
}
export const pending = () => st().data.queue.length;
