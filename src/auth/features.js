import settings from '../config/settings.js';
import { getSetting } from '../database/database.js';

// Feature switches follow command categories. A switch changed with /settings is saved in the
// bot's own data store and wins over settings.js; settings.js is the default.
export const FEATURES = Object.keys(settings.features);
export const featureKey = (cmd) => String(cmd.category || '').toLowerCase();
export function featureOn(name) {
  const o = getSetting('featureOverrides', {});
  if (typeof o[name] === 'boolean') return o[name];
  return settings.features[name] !== false;
}
import fs from 'node:fs';
export function commandOn(cmd) {
  try { const f = JSON.parse(fs.readFileSync('data/command-flags.json', 'utf8')); if ((f.disabled || []).includes(cmd.name)) return false; } catch { /* no flags file */ }
  if ((settings.disabledCommands || []).includes(cmd.name)) return false;
  const k = featureKey(cmd);
  return !k || !(k in settings.features) || featureOn(k);
}
