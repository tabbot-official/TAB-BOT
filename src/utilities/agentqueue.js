// Persistent bulk-delivery queue for /agent: many downloads of the same kind,
// delivered one by one, paced, with per-item retry and resume after a restart.
// State lives in data/agent-queue.json so a crash or restart picks up where it stopped.
import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { registry } from '../handlers/commandHandler.js';
import { createProgressMessage } from '../utils/progressBar.js';
import { getSock } from './ownersock.js';
import { formatBytes } from '../utils/helpers.js';
import { audit } from './ownershell.js';

const FILE = path.join('data', 'agent-queue.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let processing = false;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}
function save(q) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(q)); } catch { /* best effort */ }
}

export function failedItems() {
  const q = load();
  if (!q || !q.finishedAt || !Array.isArray(q.items)) return [];
  return q.items.filter((i) => i.status === 'failed');
}

export function pendingCount() {
  const q = liveQueue || load();
  return q && !q.finishedAt && Array.isArray(q.items) ? q.items.filter((i) => i.status === 'pending').length : 0;
}

// items: [{cmd, args}]. Appends to the running queue when one is active.
export function enqueue(jid, items, goal) {
  if (liveQueue && !liveQueue.finishedAt) {
    liveQueue.items.push(...items.map((i) => ({ cmd: i.cmd, args: i.args, status: 'pending', attempts: 0 })));
    save(liveQueue);
    audit('QUEUE SET ' + items.length + ' item(s) via /' + (items[0]?.cmd || '?') + ' goal="' + String(goal || '').slice(0, 120) + '" (appended to running queue)');
    setImmediate(processQueue);
    return liveQueue;
  }
  let q = load();
  if (q && !q.finishedAt && Array.isArray(q.items)) {
    q.items.push(...items.map((i) => ({ cmd: i.cmd, args: i.args, status: 'pending', attempts: 0 })));
    q.finishedAt = null;
  } else {
    q = { jid, goal: String(goal || '').slice(0, 200), items: items.map((i) => ({ cmd: i.cmd, args: i.args, status: 'pending', attempts: 0 })), done: 0, failed: 0, createdAt: Date.now(), finishedAt: null };
  }
  save(q);
  audit('QUEUE SET ' + items.length + ' item(s) via /' + (items[0]?.cmd || '?') + ' goal="' + String(goal || '').slice(0, 120) + '"');
  setImmediate(processQueue);
  return q;
}

// Owner cancel: mark every pending item cancelled and close the queue. The file
// currently downloading finishes (fetches cannot be aborted mid-flight), then the
// processor sees no pending items, posts the cancelled summary and stops.
export function cancelQueue() {
  const q = liveQueue || load();
  if (!q || q.finishedAt || !Array.isArray(q.items)) return { cancelled: 0, active: false };
  const remaining = q.items.filter((i) => i.status === 'pending');
  for (const i of remaining) i.status = 'cancelled';
  q.finishedAt = Date.now();
  save(q);
  if (liveQueue) liveQueue = q;
  audit('QUEUE CANCELLED ' + remaining.length + ' pending item(s) via /' + (q.items[0]?.cmd || '?'));
  return { cancelled: remaining.length, active: processing };
}

export function retryFailed() {
  const f = failedItems();
  if (!f.length) return 0;
  const q = load();
  for (const i of q.items) if (i.status === 'failed') { i.status = 'pending'; i.attempts = 0; }
  q.finishedAt = null;
  save(q);
  setImmediate(processQueue);
  return f.length;
}

// Called once at module load: if a queue was interrupted by a restart, resume it
// as soon as a live socket exists.
export function initAgentQueue() {
  const q = load();
  if (q && !q.finishedAt && q.items?.some((i) => i.status === 'pending')) {
    audit('QUEUE RESUME armed (' + q.items.filter((i) => i.status === 'pending').length + ' item(s) pending)');
    const t = setInterval(() => { if (getSock()) { clearInterval(t); processQueue(); } }, 15000);
    t.unref?.();
  }
}

let liveQueue = null; // in-memory queue owned by the running processor; enqueue appends land here directly

const FAIL_RE = /(fail|could ?n'?t|not found|no results|error|unavailable|try again later)/i;

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    let q = load();
    if (!q || q.finishedAt || !q.items?.some((i) => i.status === 'pending')) return;
    liveQueue = q;
    const sock = getSock();
    if (!sock) { initAgentQueue(); return; }
    const own = String(config.ownerNumber).replace(/\D/g, '');
    const qStart = Date.now();
    let currentItem = null;
    // Wrap the socket to measure real media bytes as files are delivered.
    const meter = Object.create(sock);
    meter.sendMessage = async (j, content, opts) => {
      try {
        const m = content?.audio || content?.video || content?.image || content?.document;
        if (m) {
          let n = 0;
          if (Buffer.isBuffer(m)) n = m.length;
          else if (m.url && !/^https?:/i.test(String(m.url))) { try { n = (await fs.promises.stat(String(m.url))).size; } catch { /* unmeasurable */ } }
          if (n > 0) {
            const cur = liveQueue || load();
            if (cur) { cur.bytes = (cur.bytes || 0) + n; save(cur); }
            try {
              prog.update({
                name: ((currentItem?.args || 'file').slice(0, 50)) + ' (' + formatBytes(n) + ')',
                bytes: (cur?.bytes || n), files: (cur?.done || 0) + 1,
                byteSpeed: (cur?.bytes || n) / Math.max(1, (Date.now() - qStart) / 1000),
              });
            } catch { /* best effort */ }
          }
        }
      } catch { /* metering is best effort */ }
      return sock.sendMessage(j, content, opts);
    };
    const ctx = {
      sock: meter, jid: q.jid,
      sender: own, senderJid: own + '@s.whatsapp.net',
      isOwner: true, isGroup: q.jid.endsWith('@g.us'),
      msg: { key: { remoteJid: q.jid, fromMe: false, id: 'AGENTQUEUE' + Date.now() }, message: { conversation: '/agent ' + String(q.goal || '') } },
      text: '', commands: registry,
      args: [], reply: (t, o) => sock.sendMessage(q.jid, { text: t, ...(o || {}) }),
    };
    const prog = createProgressMessage(ctx, 'task', 8000);
    await prog.begin();
    while (true) {
      q = load() || q;
      if (!liveQueue || liveQueue !== q) {
        // preserve any liveQueue appends that have not been saved yet
        if (liveQueue && liveQueue.items.length > q.items.length) q.items.push(...liveQueue.items.slice(q.items.length));
        liveQueue = q;
      }
      const total = q.items.length;
      const item = q.items.find((i) => i.status === 'pending');
      if (!item) break;
      currentItem = item;
      let ok = false;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        item.attempts = attempt; save(q);
        try { prog.update({ name: item.args.slice(0, 60) + (attempt > 1 ? ' (retry ' + attempt + ')' : ''), received: q.done + q.failed, total }); } catch {}
        const cap = [];
        try {
          const cmd = registry.get(item.cmd);
          if (!cmd) throw new Error('command /' + item.cmd + ' is not loaded');
          await cmd.run({ ...ctx, args: item.args.split(/\s+/), reply: async (t) => { cap.push(String(t).slice(0, 300)); return null; } });
          const bad = cap.find((t) => FAIL_RE.test(t));
          if (bad) throw new Error(bad.slice(0, 120));
          ok = true;
        } catch (e) {
          logger.warn('[agentqueue] /' + item.cmd + ' "' + item.args.slice(0, 40) + '" attempt ' + attempt + ': ' + (e?.message || 'error'));
          if (attempt < 2) await sleep(20000);
        }
      }
      if (ok) { item.status = 'done'; q.done = (q.done || 0) + 1; } else { item.status = 'failed'; q.failed = (q.failed || 0) + 1; }
      save(q);
      audit('QUEUE ITEM ' + (ok ? 'done' : 'FAILED') + ' /' + item.cmd + ' ' + item.args.slice(0, 80));
      await sleep(5000); // pace deliveries
    }
    q = load() || q;
    q.finishedAt = Date.now(); save(q);
    const total = q.items.length;
    const failedNames = q.items.filter((i) => i.status === 'failed').map((i) => i.args);
    const cancelledCount = q.items.filter((i) => i.status === 'cancelled').length;
    const summary = (cancelledCount
      ? '🛑 Bulk delivery stopped by you: ' + (q.done || 0) + ' delivered' + (q.bytes ? ' (' + formatBytes(q.bytes) + ')' : '') + ', ' + cancelledCount + ' cancelled.'
      : '📦 Bulk delivery finished: ' + (q.done || 0) + ' of ' + total + ' delivered' + (q.bytes ? ' (' + formatBytes(q.bytes) + ' total)' : '') + '.') +
      (failedNames.length ? '\nCould not get ' + failedNames.length + ': ' + failedNames.join(', ').slice(0, 400) + '\nSay "/agent retry" and I will try the failed ones again.' : '');
    try { await prog.text(summary); } catch { await ctx.reply(summary); }
    audit('QUEUE DONE ' + (q.done || 0) + '/' + total + ' failed=' + (q.failed || 0));
  } catch (e) {
    logger.warn('[agentqueue] runner crashed: ' + (e?.stack || e?.message || 'error'));
  } finally {
    liveQueue = null;
    processing = false;
  }
}
