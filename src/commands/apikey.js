import {createKey, listKeys, revokeKey, ROLES} from '../api/services/keys.js';
import config from '../config/config.js';

export default {
  name: 'apikey', aliases: ['apikeys'], category: 'System', ownerOnly: true,
  description: 'Owner: create, list or revoke Tab API keys',
  usage: 'apikey create <name> [readonly|service|admin|owner] | apikey list | apikey revoke <id>', minArgs: 1,
  async run(ctx) {
    if (ctx.isGroup) return ctx.reply('Use this in your private chat only. API keys are secrets.');
    const p = config.prefix; const act = (ctx.args[0] || '').toLowerCase();
    if (act === 'list') { const l = listKeys(); return ctx.reply(l.length ? '🔑 API keys:\n' + l.map((k) => `${k.id}: ${k.name} (${k.role})`).join('\n') : `No API keys. Create: ${p}apikey create myapp service`); }
    if (act === 'revoke') return ctx.reply(revokeKey(ctx.args[1] || '') ? 'Key revoked.' : 'No key with that id.');
    if (act === 'create') {
      const role = (ctx.args[2] || 'readonly').toLowerCase(); if (!ROLES.includes(role)) return ctx.reply('Role must be one of: ' + ROLES.join(', '));
      try { const k = createKey(ctx.args[1] || 'key', role); return ctx.reply(`🔑 New ${role} key (id ${k.id}). Copy it now, it is never shown again:\n\n${k.key}\n\nSend it as the X-API-Key header.`); } catch { return ctx.reply('Could not create the key (limit 50).'); }
    }
    await ctx.reply(`Usage: ${p}apikey create <name> [role] | list | revoke <id>`);
  },
};
