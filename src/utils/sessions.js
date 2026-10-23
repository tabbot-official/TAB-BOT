// Multi-turn conversational commands: a per-chat session that receives the
// chat's next plain messages until it ends or expires.
// Sessions started with a registered handlerKey persist to data/sessions.json
// and survive restarts (within their TTL). Sessions with an inline onText
// callback stay in-memory only (functions cannot be serialized).
import fs from 'node:fs';

const FILE = 'data/sessions.json';
const sessions = new Map(); // key -> { cmd, onText, handlerKey, state, expiresAt }
// Key = chat + sender: a session belongs to the person who started it, so in
// groups another member's messages can never feed someone else's session.
function key(jid, senderJid) { return senderJid ? jid + '::' + senderJid : jid; }
const handlers = new Map(); // handlerKey -> onText(sctx, text, end)
let loaded = false;

/** Register a named session handler so sessions can be restored after a restart. */
export function registerHandler(key, fn) { if (key && typeof fn === 'function') handlers.set(key, fn); }

function persist() {
  try {
    const arr = [...sessions.entries()]
      .filter(([, s]) => s.handlerKey)
      .map(([k, s]) => ({ jid: k, cmd: s.cmd, handlerKey: s.handlerKey, state: s.state, expiresAt: s.expiresAt }));
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(arr));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch { /* best effort */ }
}

function load() {
  if (loaded) return;
  loaded = true;
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return; }
  const now = Date.now();
  for (const e of Array.isArray(arr) ? arr : []) {
    if (!e || !e.jid || !e.handlerKey || !(e.expiresAt > now)) continue;
    const h = handlers.get(e.handlerKey);
    if (!h) continue;
    sessions.set(e.jid, { cmd: e.cmd || e.handlerKey, onText: h, handlerKey: e.handlerKey, state: e.state || {}, expiresAt: e.expiresAt });
  }
}

/** Start a session for ctx.jid. Either an inline onText (in-memory only) or a
 *  handlerKey registered via registerHandler (persists across restarts).
 *  onText(sctx, text, end) handles each message; sctx = { sock, jid, reply, state }. */
export function begin(ctx, { cmd, ttlMs = 5 * 60e3, state = {}, onText, handlerKey }) {
  let fn = onText;
  if (!fn && handlerKey) fn = handlers.get(handlerKey);
  if (typeof fn !== 'function') return false;
  sessions.set(key(ctx.jid, ctx.senderJid || ctx.sender), { cmd, onText: fn, handlerKey: handlerKey || null, state, expiresAt: Date.now() + ttlMs });
  persist();
  return true;
}
export function has(jid, senderJid) {
  load();
  const k = key(jid, senderJid);
  const s = sessions.get(k);
  if (!s) return false;
  if (Date.now() > s.expiresAt) { sessions.delete(k); persist(); return false; }
  return true;
}
export function end(jid, senderJid) { load(); sessions.delete(key(jid, senderJid)); persist(); }
/** Route one plain message into the active session. Returns true if consumed. */
export async function route(sock, msg, text) {
  load();
  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || jid;
  let k = key(jid, senderJid);
  let s = sessions.get(k);
  if (!s && !jid.endsWith('@g.us') && sessions.has(jid)) { k = jid; s = sessions.get(jid); } // legacy pre-key DM entries
  if (!s) return false;
  if (Date.now() > s.expiresAt) { sessions.delete(k); persist(); return false; }
  const sctx = {
    sock, jid, state: s.state,
    reply: (t, o) => sock.sendMessage(jid, { text: t, ...(o || {}) }, { quoted: msg }),
  };
  try { await s.onText(sctx, text, () => { sessions.delete(k); }); } catch { sessions.delete(k); }
  persist();
  return true;
}

// ---- Built-in persistent handlers ----------------------------------------
// 'quiz': 5-question multiple-choice trivia. State: { qs:[{q,answers,correct}], i, score }.
registerHandler('quiz', async (sctx, text, end) => {
  const state = sctx.state || {};
  const cur = (state.qs || [])[state.i || 0];
  if (!cur) { end(); return; }
  const pick = cur.answers[parseInt(String(text).trim(), 10) - 1] || String(text).trim();
  if (pick && pick.toLowerCase() === cur.correct.toLowerCase()) { state.score = (state.score || 0) + 1; await sctx.reply('Correct!'); }
  else await sctx.reply('Wrong - it was: ' + cur.correct);
  state.i = (state.i || 0) + 1;
  if (state.i >= state.qs.length) { await sctx.reply('Quiz over! Score: ' + state.score + '/' + state.qs.length); end(); return; }
  const nxt = state.qs[state.i];
  await sctx.reply('Q' + (state.i + 1) + '/' + state.qs.length + ': ' + nxt.q + '\n' + nxt.answers.map((a, j) => (j + 1) + '. ' + a).join('\n'));
});
