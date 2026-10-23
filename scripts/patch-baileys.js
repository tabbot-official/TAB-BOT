// Tab: pairing fixes for the installed Baileys build (7.0.0-rc14 and forks built from it).
// Applied to the files in node_modules BEFORE the library is first imported (scripts/runner.js calls it
// at startup and npm's postinstall runs it after every install). Idempotent: a patch already in place,
// or a lib that no longer has the old shape, is skipped. TAB_BAILEYS_PATCH=off disables all of it.
//
// What and why (all upstream, unreleased as of 2026-10-23):
//  1. link_code_companion_reg: WhatsApp now sends this notification twice. The first one (right after
//     the code is requested) has no crypto fields; rc14 reads them anyway, throws "Invalid buffer" and
//     the pairing state machine breaks. Skip the notification until the phone's keys are in it.
//     (WhiskeySockets/Baileys PR #2872, issue #2600/#2770 "Invalid buffer at toRequiredBuffer")
//  2. link_code_pairing_nonce: WhatsApp Web sends one 0x00 byte; rc14 sends the character '0' (0x30)
//     and the phone answers "Couldn't link device". (PR #2872)
//  3. Reconnect during code pairing: requestPairingCode sets creds.me early, so a reconnect before the
//     phone confirms sent a LOGIN node for a device that does not exist -> 401 logged out -> the code
//     dies and the session is wiped. Use the registration node until pairing really finished. (PR #2872)
//  4. pair-success marks creds.registered = true (needed by 3, and by bots that check `registered`).
//  5. QR: WhatsApp sends <notification type="companion_reg_refresh"> after a scan and retires the adv
//     secret; rc14 kept drawing the old secret into every QR, so a scanned QR "couldn't link".
//     Read the secret fresh on every QR render (the rotation itself lives in src/connection/whatsapp.js).
//     (PR #2765, issue #2737)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const tag = (id) => `/* tab-pairing-fix:${id} */`;

const PATCHES = [
  {
    id: 'companion-reg-stage',
    file: ['lib/Socket/messages-recv.js'],
    done: (s) => s.includes(tag('stage')),
    apply: (s) => s.replace(
      /(case 'link_code_companion_reg':\s*\n?(\s*)const linkCodeCompanionReg = ([\w$.]*?)getBinaryNodeChild\(node, 'link_code_companion_reg'\);?)/,
      (m, all, indent, ns) => `${all}\n${indent || '                '}if (!${ns}getBinaryNodeChildBuffer(linkCodeCompanionReg, 'primary_identity_pub') || !${ns}getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_wrapped_primary_ephemeral_pub')) break; ${tag('stage')}`
    ),
  },
  {
    id: 'pairing-nonce',
    file: ['lib/Socket/socket.js'],
    done: (s) => s.includes(tag('nonce')),
    apply: (s) => s.replace(
      /(tag: 'link_code_pairing_nonce',\s*attrs: \{\},\s*content: )'0'/,
      `$1Buffer.alloc(1) ${tag('nonce')}`
    ),
  },
  {
    id: 'register-until-paired',
    file: ['lib/Socket/socket.js'],
    done: (s) => s.includes(tag('register')),
    apply: (s) => s.replace(
      /if \(!creds\.me\) \{(\s*node = ([\w$.]*?)generateRegistrationNode\()/,
      `if (!creds.me || (creds.pairingCode && !creds.registered && !creds.account)) { ${tag('register')}$1`
    ),
  },
  {
    id: 'pair-success-registered',
    file: ['lib/Utils/validate-connection.js'],
    done: (s) => s.includes(tag('registered')),
    apply: (s) => s.replace(
      /(platform: platformNode\?\.attrs\.name)(\s*\};)/,
      `$1,\n        registered: true ${tag('registered')}$2`
    ),
  },
  {
    id: 'qr-fresh-adv-secret',
    file: ['lib/Socket/socket.js'],
    done: (s) => s.includes(tag('adv')),
    apply: (s) => s.replace(
      /buildPairingQRData\(ref, noiseKeyB64, identityKeyB64, advB64, browser\)/,
      `buildPairingQRData(ref, noiseKeyB64, identityKeyB64, (creds.advSecretKey || advB64) ${tag('adv')}, browser)`
    ),
  },
];

export function baileysPackageName() {
  return String(process.env.BAILEYS_PKG || '').trim() || '@whiskeysockets/baileys';
}

export function resolvePackageDir(pkg = baileysPackageName(), from = import.meta.url) {
  const req = createRequire(from);
  try { return path.dirname(req.resolve(pkg + '/package.json')); } catch { /* exports map may hide package.json */ }
  try {
    let d = path.dirname(req.resolve(pkg));
    for (let i = 0; i < 6 && d !== path.dirname(d); i++, d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, 'package.json'))) return d;
    }
  } catch { /* not installed */ }
  return null;
}

// Returns { pkg, dir, version, results: [{id, status: applied|present|shape-changed|missing-file|error}] }
export function applyBaileysPatches({ pkg = baileysPackageName(), dir, log = () => {}, dryRun = false } = {}) {
  const out = { pkg, dir: dir || null, version: null, results: [] };
  if (String(process.env.TAB_BAILEYS_PATCH || '').toLowerCase() === 'off') { out.skipped = 'TAB_BAILEYS_PATCH=off'; return out; }
  const base = dir || resolvePackageDir(pkg);
  out.dir = base;
  if (!base) { out.skipped = 'package not installed'; return out; }
  try { out.version = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).version; } catch { /* ignore */ }
  const cache = new Map();
  for (const p of PATCHES) {
    const rel = p.file.find((f) => fs.existsSync(path.join(base, f)));
    if (!rel) { out.results.push({ id: p.id, status: 'missing-file' }); continue; }
    const file = path.join(base, rel);
    try {
      const src = cache.has(file) ? cache.get(file) : fs.readFileSync(file, 'utf8');
      if (p.done(src)) { out.results.push({ id: p.id, status: 'present' }); cache.set(file, src); continue; }
      const next = p.apply(src);
      if (next === src) { out.results.push({ id: p.id, status: 'shape-changed' }); cache.set(file, src); continue; }
      cache.set(file, next);
      out.results.push({ id: p.id, status: 'applied', file: rel });
    } catch (e) {
      out.results.push({ id: p.id, status: 'error', error: String(e?.message || e) });
    }
  }
  if (!dryRun) {
    for (const [file, src] of cache) {
      try { if (fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src); }
      catch (e) { log('[baileys-patch] could not write ' + file + ': ' + (e?.message || e)); }
    }
  }
  const applied = out.results.filter((r) => r.status === 'applied').map((r) => r.id);
  const odd = out.results.filter((r) => !['applied', 'present'].includes(r.status)).map((r) => r.id + ':' + r.status);
  log(`[baileys-patch] ${pkg}@${out.version || '?'}: ${applied.length ? 'applied ' + applied.join(', ') : 'nothing new'}${odd.length ? '; skipped ' + odd.join(', ') : ''}`);
  return out;
}

// `node scripts/patch-baileys.js` (npm postinstall) patches the configured package.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { applyBaileysPatches({ log: (m) => console.log(m) }); } catch (e) { console.log('[baileys-patch] failed: ' + (e?.message || e)); }
}
