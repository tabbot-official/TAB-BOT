// "Plugins" are the bot's feature groups (command categories). Switching one off uses the same featureOverrides setting as /settings.
import settings from '../../config/settings.js';
import {FEATURES, featureOn} from '../../auth/features.js';
import {getSetting, setSetting} from '../../database/database.js';
import {getRegistry} from './botService.js';
import {notFound} from '../errors.js';
import {emit} from '../events/bus.js';

export function list() {
  const cmds = getRegistry()?.list?.() || []; const count = {};
  for (const c of cmds) { const k = String(c.category || '').toLowerCase(); count[k] = (count[k] || 0) + 1; }
  return FEATURES.map((f) => ({name: f, enabled: featureOn(f), default: settings.features[f] !== false, commands: count[f] || 0}));
}
export function setEnabled(name, on) {
  const f = String(name).toLowerCase(); if (!FEATURES.includes(f)) throw notFound('No such plugin');
  setSetting('featureOverrides', {...getSetting('featureOverrides', {}), [f]: !!on}); emit('plugin.changed', {name: f, enabled: !!on});
  return list().find((p) => p.name === f);
}
