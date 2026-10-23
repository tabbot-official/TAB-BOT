// IP: lookup info about an IP address or domain (free keyless ipwho.is).
import { featOn } from '../config/features.js';
import logger from '../utils/logger.js';

export default {
  name: 'ip', aliases: ['ipinfo', 'iplookup'], category: 'Tools',
  description: 'Look up where an IP address or domain lives',
  usage: 'ip <address or domain>',
  async run(ctx) {
    if (!featOn('ipinfo')) return ctx.reply('IP lookup is turned off right now.');
    const q = ctx.args.join(' ').trim();
    if (!q || q.length > 100) return ctx.reply('Give me an IP or domain. Example: /ip 8.8.8.8');
    try {
      const r = await fetch('https://ipwho.is/' + encodeURIComponent(q) + '?fields=success,message,ip,type,continent,country,region,city,latitude,longitude,connection,timezone', { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (!j.success) return ctx.reply('No info for that: ' + (j.message || 'not found'));
      const c = j.connection || {};
      return ctx.reply(`🌐 *${j.ip}* (${j.type})\n📍 ${[j.city, j.region, j.country].filter(Boolean).join(', ')}\n🗺 ${j.latitude}, ${j.longitude}\n🕒 ${j.timezone?.id || '-'}\n🏢 ${[c.isp, c.org].filter(Boolean).join(' / ') || '-'}${c.asn ? '\n🔗 ' + c.asn : ''}`);
    } catch (e) {
      logger.warn('[ip] lookup failed: ' + (e?.message || 'error'));
      return ctx.reply('The lookup service is not answering right now. Try again in a minute.');
    }
  },
};
