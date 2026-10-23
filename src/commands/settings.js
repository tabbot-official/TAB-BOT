import settings from '../config/settings.js';
import config from '../config/config.js';
import { FEATURES, featureOn } from '../auth/features.js';
import { getSetting, setSetting } from '../database/database.js';

const mask = (n) => (n ? n.slice(0, 2) + '******' + n.slice(-2) : 'not set');

export default {
  name: 'settings',
  category: 'General',
  description: 'Owner details and feature on/off switches',
  usage: 'settings | settings <feature> on|off | settings reset <feature>',
  ownerOnly: true,
  async run(ctx) {
    const [a, b] = ctx.args.map((x) => x.toLowerCase());
    const over = getSetting('featureOverrides', {});
    if (a === 'reset' && FEATURES.includes(b)) {
      delete over[b];
      setSetting('featureOverrides', { ...over });
      return ctx.reply(`${b} is back to the settings.js value (${featureOn(b) ? 'on' : 'off'}).`);
    }
    if (a && FEATURES.includes(a) && ['on', 'off'].includes(b)) {
      setSetting('featureOverrides', { ...over, [a]: b === 'on' });
      return ctx.reply(`${a} is now ${b.toUpperCase()}. Saved, it survives restarts.`);
    }
    if (a) return ctx.reply(`Use ${config.prefix}settings ${FEATURES[0]} on|off, or ${config.prefix}settings reset <feature>.\nFeatures: ${FEATURES.join(', ')}`);
    const o = settings.owner;
    const lines = [
      'Tab settings',
      `Owner: ${o.name || 'not set'} (${mask(o.number || config.ownerNumber)})`,
      `Timezone: ${o.timezone}  Language: ${o.language}`,
      `Owner login: ${settings.auth.enabled ? 'on' : 'off'} (${settings.auth.lockOwnerCommands ? 'locks owner commands' : 'no lock'}, code ${settings.auth.codeExpiryMinutes} min, session ${settings.auth.sessionHours} h)`,
      '',
      'Features:',
      ...FEATURES.map((f) => `${featureOn(f) ? '✅' : '❌'} ${f}${typeof over[f] === 'boolean' ? ' (changed in chat)' : ''}`),
      '',
      `Change: ${config.prefix}settings <feature> on|off`,
      'Everything else: edit settings.js on the server and restart.',
    ];
    await ctx.reply(lines.join('\n'));
  },
};
