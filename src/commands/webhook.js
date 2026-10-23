// P6: manage outbound webhooks from WhatsApp (owner only).
// The signed-delivery engine lives in api/services/webhooks.js (HMAC-SHA256, retries, SSRF guard).
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import * as hooks from '../api/services/webhooks.js';
import { emit } from '../api/events/bus.js';

export default {
  name: 'webhook',
  aliases: ['webhooks'],
  category: 'Owner',
  description: 'Manage event webhooks (owner only)',
  usage: 'webhook list | webhook add <https-url> [event1,event2] | webhook del <id> | webhook test <id>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('plugins')) return ctx.reply('Plugins and webhooks are turned off right now.');
    const [sub, ...rest] = ctx.args;
    const P = config.prefix;
    try {
      if (!sub || sub === 'list') {
        const l = hooks.list();
        if (!l.length) return ctx.reply('No webhooks yet. Add one: ' + P + 'webhook add https://example.com/hook');
        return ctx.reply('*Webhooks* (' + l.length + '/10)\n' + l.map((w) => '• ' + w.id + ' -> ' + w.url + '\n  events: ' + w.events.join(', ') + (w.failures ? ' (' + w.failures + ' failures)' : '')).join('\n') + '\n\nEvent types: ' + hooks.EVENT_TYPES.join(', '));
      }
      if (sub === 'add') {
        const url = rest[0] || '';
        const events = rest[1] ? rest[1].split(',').map((s) => s.trim()).filter(Boolean) : undefined;
        const w = await hooks.create({ url, events });
        logger.info('[webhook] created ' + w.id + ' -> ' + w.url);
        return ctx.reply('Webhook added: ' + w.id + ' -> ' + w.url + '\nEvents: ' + w.events.join(', ') + '\n\nSigning secret (shown once, keep it safe):\n' + w.secret);
      }
      if (sub === 'del' || sub === 'delete' || sub === 'remove') {
        if (!rest[0]) return ctx.reply('Which one? ' + P + 'webhook del <id>');
        return ctx.reply(hooks.remove(rest[0]) ? 'Webhook ' + rest[0] + ' deleted.' : 'No webhook with that id.');
      }
      if (sub === 'test') {
        if (!rest[0]) return ctx.reply('Which one? ' + P + 'webhook test <id>');
        const w = hooks.list().find((x) => x.id === rest[0]);
        if (!w) return ctx.reply('No webhook with that id.');
        emit('webhook.test', { id: w.id, note: 'manual test from WhatsApp' });
        return ctx.reply('Test event sent to ' + w.url + ' (watch your endpoint for a signed POST).');
      }
      return ctx.reply('Usage: ' + P + 'webhook list | add <https-url> [events] | del <id> | test <id>');
    } catch (e) {
      return ctx.reply('Could not do that: ' + String(e.message || e).slice(0, 150));
    }
  },
};
