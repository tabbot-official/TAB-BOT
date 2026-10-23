import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Loads the optional root-level settings.js (owner details, feature switches, owner login).
// A missing or broken settings.js never stops the bot: defaults below are used instead.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULTS = {
  owner: { name: '', number: '', timezone: 'Asia/Kolkata', language: 'en' },
  bot: { name: '', autoStatusView: null, allowGroups: null, ownerOnly: null },
  auth: { enabled: true, lockOwnerCommands: true, codeLength: 6, codeExpiryMinutes: 5, sessionHours: 12, maxAttempts: 5, exemptCommands: ['login', 'logout', 'menu', 'help', 'status', 'ping', 'checksudo'] },
  features: { ai: true, downloaders: true, image: true, games: true, economy: true, utilities: true, books: true, group: true, recover: true, whatsapp: true, tools: true, language: true },
  ecosystem: { sid: '', number: '', portalUrl: '', ticket: '', statusBeat: true, autoPair: true },
  disabledCommands: [],
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

let loaded = {};
const file = path.join(root, 'settings.js');
try {
  if (fs.existsSync(file)) loaded = (await import(pathToFileURL(file).href)).default || {};
} catch (err) {
  console.warn('[settings] settings.js could not be loaded, using defaults:', err.message);
}

const settings = merge(DEFAULTS, loaded);
settings.owner.number = String(settings.owner.number || '').replace(/\D/g, '');
// Pairing-portal identity. A bad S-ID is ignored (treated as not set) instead of stopping the bot.
const sidRaw = String(settings.ecosystem?.sid || '').trim().toUpperCase();
settings.ecosystem = { sid: /^S-[A-Z0-9]{6}$/.test(sidRaw) ? sidRaw : '', number: String(settings.ecosystem?.number || '').replace(/\D/g, ''), portalUrl: String(settings.ecosystem?.portalUrl || '').trim(), ticket: String(settings.ecosystem?.ticket || '').trim(), statusBeat: settings.ecosystem?.statusBeat !== false, autoPair: settings.ecosystem?.autoPair !== false };
export default settings;
