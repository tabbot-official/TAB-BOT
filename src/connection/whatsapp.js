import { getPollMessage, applyUpdates as applyPollUpdates, resume as resumePolls } from '../polls/index.js';
import {bindPairedOwner} from '../permissions/paired-owner.js';
import fs from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import * as BaileysLib from '@whiskeysockets/baileys';
import { randomBytes } from 'node:crypto';
import { pickBrowser, pickVersion, normalizePairingNumber, rotateQrAdvSecret } from './pairingSetup.js';
import pino from 'pino';
import {connection,stop as stopOps} from '../ops/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { handleMessage, trackOutgoing } from '../handlers/messageHandler.js';
import * as catchup from '../utilities/catchup.js';
import { writeState } from '../utilities/sessionstate.js';
import { isOn as toggleOn } from '../utilities/toggles.js';
import { startAutobio } from '../utilities/autobio.js';
import { backupNow } from '../utilities/authbackup.js';
import { featOn } from '../config/features.js';
import { getCached, cacheMessage } from '../utils/msgCache.js';
import { observe, onRevokeKey } from '../recover/index.js';
import { getSettings as recoverSettings, get as recoverGet } from '../recover/store.js';
import { detectEnv } from '../telemetry/env.js';
import { bridge, cleanCode, createHeartbeat, claimSession, createStatusBeat, createPairing, createProofRelay, loadSaved, loadTicket, redeemCode } from '../ecosystem/pairing.js';
import { savePairingQr, clearPairingQr } from './pairingQr.js';

// Baileys or a fork chosen with BAILEYS_PKG (scripts/runner.js redirects the import). CJS forks hand the
// whole module as the default export, so accept both shapes.
const Baileys = BaileysLib.default && typeof BaileysLib.default === 'object' && !BaileysLib.makeWASocket ? { ...BaileysLib.default, ...BaileysLib } : BaileysLib;
const makeWASocket = typeof Baileys.default === 'function' ? Baileys.default : (Baileys.makeWASocket || Baileys.default?.default);
const { DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState } = Baileys;
const MAX_PAIRING_ATTEMPTS = 3;
const MAX_MESSAGE_AGE_S = 120;

let sock = null;
let stopping = false;
let reconnectAttempts = 0;
let pairingAttempts = 0;
let pairingNumber = normalizePairingNumber(config.pairingNumber || config.ownerNumber || '');
// Tab: QR-only linking. PAIRING_METHOD=qr (or no number and no interactive terminal, e.g. a hosting panel)
// skips the phone-number prompt and the pairing code; the bot only writes pairing-qr.png to scan.
const qrOnly = () => String(process.env.PAIRING_METHOD || '').trim().toLowerCase() === 'qr' || (!pairingNumber && !process.stdin.isTTY);

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function promptNumber() {
  for (let i = 0; i < 3; i++) {
    const answer = (await ask('Enter the WhatsApp number to connect (country code, digits only, e.g. 919876543210): ')).replace(/\D/g, '');
    if (answer.length >= 8 && answer.length <= 15) return answer;
    console.log('That does not look like a valid phone number. Try again.');
  }
  throw new Error('No valid phone number provided');
}

async function wipeAuth() {
  await fs.rm(config.paths.auth, { recursive: true, force: true });
  await fs.mkdir(config.paths.auth, { recursive: true });
}

async function requestPairing(s) {
  try {
    if (!pairingNumber) pairingNumber = await promptNumber();
    pairingNumber = normalizePairingNumber(pairingNumber);
    if (s.authState?.creds?.registered || s.authState?.creds?.account) return;
    pairingAttempts++;
    if (pairingAttempts > MAX_PAIRING_ATTEMPTS) {
      logger.error('Pairing was not completed after several attempts. Stopping to avoid WhatsApp rate limits. Start the bot again when ready.');
      clearPairingQr(config.paths.data).catch(() => {});
      return shutdown(1);
    }
    const code = await s.requestPairingCode(pairingNumber);
    pairing?.relayCode(code).catch(() => {});
    const pretty = code.match(/.{1,4}/g)?.join('-') || code;
    // Printed on purpose: this one-time code is what the user types into WhatsApp.
    console.log('\n==============================================');
    console.log(`  PAIRING CODE:  ${pretty}`);
    console.log('  WhatsApp > Settings > Linked devices > Link a device');
    console.log('  > "Link with phone number instead" and enter the code.');
    console.log('  The code expires in about 2 minutes.');
    console.log('==============================================\n');
    logger.warn('PAIRING CODE issued to owner number, valid about 2 minutes: ' + pretty);
  } catch (err) {
    logger.error('Could not get a pairing code:', err);
  }
}

// Pairing portal hooks. Inactive unless ecosystem.portalUrl and ecosystem.ticket are set in settings.js.
let pairing = null;
const proofRelay = (process.env.PORTAL_URL && process.env.PORTAL_PROOF_KEY) ? createProofRelay({ log: (m) => logger.warn(m) }) : null;
const heartbeat = proofRelay ? createHeartbeat({ version: (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return ''; } })(), log: (m) => logger.warn(m) }) : null;
const statusBeat = createStatusBeat({ eco: config.ecosystem, dir: config.paths.data, version: (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return ''; } })(), hosting: () => detectEnv(), log: (m) => logger.warn(m) });
function setupPairing(s) {
  const saved = loadSaved(config.paths.data);
  if (saved && !config.ecosystem.sid) config.ecosystem.sid = saved;
  const tk = loadTicket(config.paths.data); if (tk && !config.ecosystem.ticket) { config.ecosystem.ticket = tk.token; config.ecosystem.number = tk.number; }
  pairing = createPairing({
    eco: config.ecosystem, dir: config.paths.data, log: (m) => logger.warn(m),
    applySid: (sid) => { config.ecosystem.sid = sid; setTimeout(() => statusBeat.afterPair(), 1000); },
    sendText: (num, text) => s.sendMessage(String(num).replace(/\D/g, '') + '@s.whatsapp.net', { text }),
    sendSelf: (text) => { const me = String(s.user?.id || '').split('@')[0].split(':')[0]; return s.sendMessage(me + '@s.whatsapp.net', { text }); },
  });
}

// /pair CODE on an already linked bot: redeem, then run the same proof flow in the background.
bridge.start = async (code, number) => {
  if (!pairing) return { ok: false, why: 'WhatsApp is not connected yet. Try again in a minute.' };
  if (loadSaved(config.paths.data)) return { ok: false, why: 'This bot is already paired. Type /sid to see your S-ID.' };
  const r = await redeemCode({ eco: config.ecosystem, dir: config.paths.data, code, number });
  if (r.ok) pairing.onLinked().catch(() => {});
  return r;
};


export async function startWhatsApp() {
  stopping = false;
  { const c = await claimSession({ eco: config.ecosystem, authDir: config.paths.auth, dataDir: config.paths.data }); if (c.ok) logger.info('Your WhatsApp session from the pairing website was collected. No second link is needed.'); }
  const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);
  // Ask for the number BEFORE opening the socket, so the pairing code is fresh when it appears.
  if (!pairingNumber && !state.creds.registered && config.ecosystem.ticket && config.ecosystem.number) pairingNumber = config.ecosystem.number;
  if (!state.creds.registered && qrOnly()) {
    logger.info('QR linking: waiting for the QR code (saved as pairing-qr.png in the data folder). Scan it in WhatsApp > Linked devices > Link a device.');
  } else if (!state.creds.registered && !pairingNumber) {
    try {
      pairingNumber = await promptNumber();
    } catch (err) {
      logger.error(err.message);
      return shutdown(1);
    }
  }
  // Paste-free pairing: a code from the pairing page (env PORTAL_CODE or typed here) is traded for a ticket and stored in data/.
  if (!state.creds.registered && !config.ecosystem.ticket && !loadSaved(config.paths.data)) {
    // Auto-skip after 20s so an unattended restart is never stuck on this prompt.
    const typed = process.env.PORTAL_CODE || (process.stdin.isTTY ? await Promise.race([ask('Portal code from the pairing page (press Enter to skip): '), new Promise((r) => setTimeout(() => r(''), 20_000))]) : '');
    if (cleanCode(typed)) { const r = await redeemCode({ eco: config.ecosystem, dir: config.paths.data, code: typed, number: pairingNumber }); logger[r.ok ? 'info' : 'warn'](r.ok ? 'Portal code accepted.' : 'Portal code not accepted: ' + r.why); }
  }
  // Tab: the version Baileys' own JSON reports lagged WhatsApp Web by ~3 months (2.3000.1043857760 on
  // 2026-10-23 vs 1051488527 live), and WhatsApp rejects code/QR links from stale clients with
  // "Couldn't link device" (Baileys #2679, #2705). Ask web.whatsapp.com first; WA_VERSION overrides.
  const picked = await pickVersion(Baileys, { log: (m) => logger.warn(m) });
  const version = picked.version;
  const browser = pickBrowser(Baileys.Browsers, process.env.WA_BROWSER);
  logger.info(`[pairing] WhatsApp Web version ${version ? version.join('.') : 'library default'} (${picked.source}); browser ${JSON.stringify(browser)}`);
  const silent = pino({ level: 'silent' });
  // Presence audit: Baileys traces every frame it sends; log only presence/chatstate/passive/receipt tags (type only, never content).
  const auditLog = (o, m) => {
    try {
      const x = String(o?.xml || '');
      if (!x || (o?.msg || m) !== 'xml send') return;
      const mm = x.match(/^<(presence|chatstate|iq|receipt)\b([^>]*)>/);
      if (!mm) return;
      if (mm[1] === 'receipt') return;
      if (mm[1] === 'iq' && !/xmlns=["']passive["']/.test(x)) return;
      const attrs = mm[2].replace(/name=("[^"]*"|'[^']*')/, 'name=*').trim().slice(0, 80);
      const child = (x.match(/<(composing|paused|recording|active|passive)\b/) || [])[1] || '';
      logger.info('[presence-audit] sent <' + mm[1] + ' ' + attrs + '> ' + child);
    } catch (_) { /* ignore */ }
  };
  const noop = () => {};
  // Baileys' own warnings/errors used to vanish here, which hid every pairing failure. Surface the
  // message line only (never node contents or keys).
  const libLine = (lvl) => (o, m) => {
    try {
      const msg = typeof o === 'string' ? o : (m || o?.msg || o?.err?.message || o?.error?.message || '');
      const err = typeof o === 'object' ? (o?.err?.message || o?.error?.message || o?.trace?.split?.('\n')?.[0] || '') : '';
      if (!msg && !err) return;
      logger.warn(`[baileys ${lvl}] ${String(msg).slice(0, 200)}${err && err !== msg ? ' :: ' + String(err).slice(0, 200) : ''}`);
    } catch (_) { /* ignore */ }
  };
  const auditPino = { level: 'trace', trace: auditLog, debug: noop, info: noop, warn: libLine('warn'), error: libLine('error'), fatal: libLine('fatal'), child() { return auditPino; } };

  // Baileys 7.x internal creds.update listener (lib/Socket/socket.js) broadcasts a bare <presence/>
  // (= "available") on EVERY partial creds update (prekey rotation, account sync counters, ...),
  // not only on real renames. Its listeners cannot be removed through the event wrapper, so patch
  // that block out of the installed lib before creating the socket. Idempotent; no-op when the lib
  // changes shape (then the audit log simply shows the frames again). JARVIS_PRESENCE=on skips this.
  try {
    if (process.env.JARVIS_PRESENCE !== 'on') {
      const req = createRequire(import.meta.url);
      const libFile = path.join(path.dirname(req.resolve('@whiskeysockets/baileys/package.json')), 'lib', 'Socket', 'socket.js');
      const libSrc = readFileSync(libFile, 'utf8');
      const blockRe = /ev\.on\('creds\.update', update => \{\s*const name = update\.me\?\.name;[\s\S]*?Object\.assign\(creds, update\);(\s*\}\);)/;
      if (blockRe.test(libSrc)) {
        const stripped = libSrc.replace(blockRe, "ev.on('creds.update', update => {\n        Object.assign(creds, update);\n    });");
        if (stripped !== libSrc) { writeFileSync(libFile, stripped); logger.info('[presence-guard] patched Baileys creds.update presence broadcaster out of lib/Socket/socket.js'); }
      } else {
        logger.info('[presence-guard] Baileys creds.update broadcaster block not found (already patched or lib changed)');
      }
    }
  } catch (e) {
    logger.warn('[presence-guard] could not patch Baileys lib: ' + (e?.message || e));
  }
  const s = makeWASocket({
    version,
    logger: auditPino,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silent) },
    // Tab: macOS/Chrome by default (Baileys' documented identity for code pairing). WA_BROWSER=ubuntu|windows|macos
    // or a custom "OS,Browser,Version" triple, e.g. WA_BROWSER=Ubuntu,Chrome,22.04.4.
    browser,
    markOnlineOnConnect: false,
    // Each login QR stays valid ~60s (Baileys default is 60s for the first, 20s after).
    qrTimeout: 60_000,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // Lets WhatsApp re-send messages we could not decrypt the first time (needed for full media delivery).
    getMessage: async (key) => getCached(key?.id)?.message || getPollMessage(key?.id),
  });
  sock = s;
  // Presence guard: never broadcast online/typing/recording unless JARVIS_PRESENCE=on.
  // Only 'unavailable' (appear offline) is allowed through.
  try {
    const origPresence = s.sendPresenceUpdate?.bind(s);
    if (origPresence) {
      s.sendPresenceUpdate = async (type, ...rest) => {
        if (process.env.JARVIS_PRESENCE === 'on' || type === 'unavailable') return origPresence(type, ...rest);
        return undefined;
      };
    }
  } catch (_) { /* ignore */ }
  // (bare-presence blocking happens in patchBaileysPresenceBroadcast() before the socket is created)
  // Baileys also sends a typeless <presence name=..> frame (counts as online) on connect/name sync; re-assert offline after it.
  try {
    if (process.env.JARVIS_PRESENCE !== 'on') {
      s.ev.on('connection.update', (u) => {
        if (u?.connection === 'open') for (const d of [1500, 5000, 15000, 45000]) setTimeout(() => { s.sendPresenceUpdate('unavailable').catch(() => {}); }, d);
      });
    }
  } catch (_) { /* ignore */ }
  // After the bot sends anything, re-assert 'unavailable' shortly after so the account does not stay marked online.
  try {
    if (process.env.JARVIS_PRESENCE !== 'on') {
      const origSend = s.sendMessage.bind(s);
      let t;
      s.sendMessage = async (...a) => {
        try { return await origSend(...a); } finally {
          clearTimeout(t);
          t = setTimeout(() => { s.sendPresenceUpdate('unavailable').catch(() => {}); }, 3000);
        }
      };
    }
  } catch (_) { /* ignore */ }
  trackOutgoing(s);
  setupPairing(s);
  // Pairing diagnostics: one line per pairing-related frame, so a failed link is visible in the console.
  let lastQr = '';
  try {
    s.ws.on('CB:notification', (node) => {
      try {
        const type = node?.attrs?.type || '';
        if (type === 'link_code_companion_reg') {
          const child = (node.content || []).find?.((c) => c?.tag === 'link_code_companion_reg');
          const kids = Array.isArray(child?.content) ? child.content.map((c) => c.tag) : [];
          const ready = kids.includes('primary_identity_pub') && kids.includes('link_code_pairing_wrapped_primary_ephemeral_pub');
          logger.warn(`[pairing] phone answered the code request (stage ${child?.attrs?.stage || 'none'}; ${ready ? 'phone keys present, finishing link' : 'no keys yet, waiting for the code to be entered'})`);
        } else if (type === 'companion_reg_refresh') {
          const creds = s.authState.creds;
          if (!creds.pairingCode && !creds.registered && !creds.account) {
            creds.advSecretKey = randomBytes(32).toString('base64');
            s.ev.emit('creds.update', { advSecretKey: creds.advSecretKey });
            if (lastQr) {
              const qr = rotateQrAdvSecret(lastQr, creds.advSecretKey);
              lastQr = qr;
              savePairingQr(qr, config.paths.data, (m) => logger.warn(m)).catch(() => {});
            }
            logger.warn('[pairing] WhatsApp refreshed the link secret (companion_reg_refresh); QR redrawn with the new one.');
          } else {
            logger.warn('[pairing] companion_reg_refresh received during code pairing (ignored).');
          }
        }
      } catch (_) { /* ignore */ }
    });
    s.ws.on('CB:iq,type:error', (node) => {
      try {
        if (s.authState.creds.registered) return;
        const err = (node.content || []).find?.((c) => c?.tag === 'error');
        logger.warn(`[pairing] WhatsApp answered a link request with error ${err?.attrs?.code || '?'} ${err?.attrs?.text || ''}`.trim() + (pairingRequested ? ' (code request: check the number is the phone\'s WhatsApp number, country code first)' : ''));
      } catch (_) { /* ignore */ }
    });
    s.ws.on('CB:iq,,pair-success', () => logger.warn('[pairing] pair-success: WhatsApp accepted the link, finishing login…'));
    s.ws.on('CB:failure', (node) => logger.warn(`[pairing] WhatsApp refused the session (failure reason ${node?.attrs?.reason || '?'}${node?.attrs?.location ? ', location ' + node.attrs.location : ''})`));
    s.ws.on('CB:stream:error', (node) => logger.warn(`[pairing] stream error ${node?.attrs?.code || ''} ${(node?.content || []).map?.((c) => c.tag).join(',') || ''}`.trim()));
  } catch (_) { /* diagnostics are optional */ }
  try { resumePolls(s); } catch { /* polls are optional */ }

  s.ev.on('creds.update', async (update) => {
    try {
      // The removed Baileys listener used to do this merge; keep credential state current.
      if (update && typeof update === 'object') Object.assign(s.authState.creds, update);
    } catch (_) { /* ignore */ }
    try {
      await saveCreds();
      const nowT = Date.now(); if (nowT - (globalThis.__abLast || 0) > 10 * 60 * 1000) { globalThis.__abLast = nowT; backupNow(); }
    } catch (err) {
      logger.error('Saving credentials failed:', err);
    }
  });

  let pairingRequested = false;
  s.ev.on('connection.update', async (update) => {
    try {
      const { connection: connectionState, lastDisconnect, qr } = update;

      // A QR event means the socket is ready and not logged in. Save the scannable QR image
      // (WhatsApp refreshes it about every 20s) and also request a phone pairing code as fallback.
      if (qr && !s.authState.creds.registered) {
        lastQr = qr;
        savePairingQr(qr, config.paths.data, (m) => logger.warn(m)).catch((e) => logger.warn('Pairing QR save failed: ' + (e?.message || e)));
        if (qrOnly()) logger.info('New QR code ready: pairing-qr.png in the data folder (valid about 60 s).');
        if (!pairingRequested && !qrOnly()) {
          pairingRequested = true;
          await sleep(1500);
          await requestPairing(s);
        }
      }

      if (connectionState === 'connecting') logger.info('Connecting to WhatsApp…');

      if (connectionState === 'open') {
        try { const { setSock } = await import('../utilities/ownersock.js'); setSock(s); } catch {}
        try { await bindPairedOwner(s,state.creds.me,config); } catch { config.ownerNumber=''; logger.error('Paired owner identity/save failed. Stopping; check auth storage and connected identity.');return shutdown(1); }
        try { const { clearRevoked } = await import('../utilities/authbackup.js'); clearRevoked(); } catch {}
        connection(s,true);
        heartbeat?.setConnected(true);
        statusBeat.setConnected(true);
        reconnectAttempts = 0;
        pairingAttempts = 0;
        logger.info('WhatsApp connection established');
        clearPairingQr(config.paths.data).catch(() => {});
        try {
          const { onConnected } = await import('../utilities/updateguard.js');
          const { registry: reg2, commandLoadFailures: clf2 } = await import('../handlers/commandHandler.js');
          onConnected({ registry: reg2, commandLoadFailures: clf2 }).then((verdict) => {
            if (verdict && config.ownerNumber) s.sendMessage(config.ownerNumber.replace(/\D/g, '') + '@s.whatsapp.net', { text: verdict }).catch(() => {});
          }).catch(() => {});
          const { quarantinedGenerated: qg } = await import('../handlers/commandHandler.js');
          if (qg && qg.length && config.ownerNumber) {
            s.sendMessage(config.ownerNumber.replace(/\D/g, '') + '@s.whatsapp.net', { text: '🛡️ Security gate: ' + qg.length + ' generated command(s) FAILED the structural check and were NOT loaded: ' + qg.map((n) => '/' + n).join(', ') + '. Their files are untouched on disk. Inspect with "/agent history ' + qg[0] + '" or remove with "/agent remove the ' + qg[0] + ' command". Nothing else was affected.' }).catch(() => {});
          }
        } catch {}
        writeState('connected', { code: null });
        startAutobio(s);
        pairing?.onLinked().catch(() => {});
        // Run any missed/queued commands once the session has settled.
        setTimeout(() => { if (featOn('catchup')) catchup.drain(s, handleMessage).then((n) => { if (n) logger.info(`[catchup] ran ${n} queued command(s)`); }).catch(() => {}); }, 12000);
      }

      if (connectionState === 'close') {
        connection(s,false);
        heartbeat?.setConnected(false);
        statusBeat.setConnected(false);
        const code = lastDisconnect?.error?.output?.statusCode;
        if (stopping) return;
        if (code === DisconnectReason.loggedOut) {
          logger.warn('Logged out from WhatsApp (session removed). Clearing saved login; a new pairing will be needed.');
          writeState('logged_out', { code });
          try { const { emit } = await import('../api/events/bus.js'); emit('session.revoked', { code, at: Date.now() }); } catch {}
          try { const { markRevoked } = await import('../utilities/authbackup.js'); markRevoked('loggedOut status ' + code); } catch {}
          await wipeAuth();
          pairingNumber = config.pairingNumber || config.ownerNumber || pairingNumber;
          return setTimeout(() => startWhatsApp().catch((e) => logger.error('Restart failed:', e)), 3000);
        }
        if (code === DisconnectReason.connectionReplaced) {
          logger.error('This session was replaced by another login. Stopping.');
          writeState('replaced', { code });
          return shutdown(1);
        }
        if (code === DisconnectReason.badSession) {
          logger.warn('Saved session is corrupted. Clearing it.');
          await wipeAuth();
        }
        reconnectAttempts++;
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** Math.min(reconnectAttempts, 5));
        writeState('reconnecting', { code: code ?? null });
        logger.warn(`Connection closed (code ${code ?? 'unknown'}). Reconnecting in ${Math.round(delay / 1000)}s…`);
        setTimeout(() => startWhatsApp().catch((e) => logger.error('Reconnect failed:', e)), delay);
      }
    } catch (err) {
      logger.error('connection.update handler failed:', err);
    }
  });

  // Deletes can also arrive as an update with a revoke stub; handle both paths (duplicates are ignored).
  s.ev.on('messages.update', async (updates) => {
    for (const u of updates || []) {
      try {
        if (u?.update?.pollUpdates && u.key?.id) applyPollUpdates(u.key.id, u.update.pollUpdates);
        const stub = u?.update?.messageStubType;
        if ((stub === 1 || stub === 'REVOKE') && u.key?.id) await onRevokeKey(s, u.key);
        // ANTIEDIT: someone rewrote a message we still have - show the original in the group.
        const edited = u?.update?.message?.editedMessage;
        if (edited && u.key?.id && featOn('antiedit') && recoverSettings().antiedit) {
          const orig = recoverGet(u.key.id);
          const chat = u.key.remoteJid || orig?.chat || '';
          if (orig && orig.kind === 'msg' && chat.endsWith('@g.us')) {
            const inner = edited.message || edited;
            const newText = inner.conversation || inner.extendedTextMessage?.text || '';
            const oldText = orig.text || '(a media or unsupported message)';
            if (newText && newText !== oldText) {
              const who = orig.who ? `${orig.who}@s.whatsapp.net` : undefined;
              await s.sendMessage(chat, {
                text: `✏️ @${orig.who || 'someone'} edited a message.

*Before:* ${oldText.slice(0, 900)}
*After:* ${newText.slice(0, 900)}`,
                mentions: who ? [who] : [],
              }).catch(() => {});
            }
          }
        }
      } catch (err) { logger.warn('Delete update failed:', err.message); }
    }
  });

  // ANTICALL: reject calls when the owner turned it on; the owner's own calls always ring through.
  s.ev.on('call', async (calls) => {
    try {
      if (!featOn('anticall') || !toggleOn('anticall')) return;
      for (const c of calls || []) {
        const from = c?.from || '';
        if (!from || from.endsWith('@g.us')) continue;
        if (config.ownerNumber && from.split('@')[0].split(':')[0] === String(config.ownerNumber).replace(/\D/g, '')) continue;
        await s.rejectCall(c.id, from).catch(() => {});
        const k = 'call:' + from;
        const now = Date.now();
        if ((globalThis.__callNotice?.[k] || 0) < now - 3600e3) {
          globalThis.__callNotice = { ...(globalThis.__callNotice || {}), [k]: now };
          await s.sendMessage(from, { text: '📵 ' + config.botName + ' does not take calls. Please send a message instead.' }).catch(() => {});
        }
        logger.info('[anticall] rejected call from ' + from.split('@')[0]);
      }
    } catch (e) { logger.warn('[anticall] ' + (e?.message || 'error')); }
  });

  s.ev.on('messages.upsert', async ({ messages, type }) => {
    // Offline/history deliveries are remembered for recovery; commands are queued for catch-up.
    if (type !== 'notify') {
      for (const msg of messages || []) { cacheMessage(msg); observe(s, msg).catch(() => {}); if (featOn('catchup')) catchup.consider(msg); }
      return;
    }
    for (const msg of messages) {
      if (proofRelay && !msg.key?.fromMe) { const pt = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''; if (pt.startsWith('JARVIS-PROOF ')) { const who = String(msg.key?.remoteJid || ''); const alt = String(msg.key?.remoteJidAlt || ''); const nj = who.endsWith('@s.whatsapp.net') ? who : alt.endsWith('@s.whatsapp.net') ? alt : ''; proofRelay(pt, nj.split('@')[0]).catch(() => {}); continue; } }
      const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0);
      if (ts && Date.now() / 1000 - ts > MAX_MESSAGE_AGE_S) { if (featOn('catchup')) catchup.consider(msg); continue; } // aged out of live path: queue for catch-up
      catchup.markDone(msg.key?.id);
      handleMessage(s, msg).catch((err) => logger.error('Unhandled message error:', err));
    }
  });

  return s;
}

/** Logs the current WhatsApp login out (used by the API session revoke; the owner must pair again). */
export async function logoutSession() { if (!sock) throw new Error('not connected'); await sock.logout(); }

export async function shutdown(exitCode = 0) {
  if (stopping && exitCode === 0) return;
  stopping = true;
  stopOps();
  try {
    sock?.end(undefined);
  } catch {
    /* ignore */
  }
  const { flushDatabase } = await import('../database/database.js');
  await flushDatabase().catch(() => {});
  logger.info('Shut down');
  setTimeout(() => process.exit(exitCode), 200);
}
