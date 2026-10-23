import config from '../config/config.js';
import { getToken } from '../dashboard/server.js';

export default {
  name: 'dashboard',
  aliases: ['webpanel', 'panel'],
  category: 'System',
  ownerOnly: true,
  description: 'Owner web dashboard link (live stats)',
  usage: 'dashboard [rotate]',
  async run(ctx) {
    if (!ctx.isOwner || ctx.isGroup) return ctx.reply('The dashboard link is owner-only and private-chat only.');
    const port = Number(process.env.DASHBOARD_PORT || 0);
    if (!port) return ctx.reply('Dashboard is off. The host must set DASHBOARD_PORT (and expose it) to turn it on.');
    const rotate = (ctx.args[0] || '').toLowerCase() === 'rotate';
    const t = getToken(rotate);
    const base = process.env.DASHBOARD_URL || `http://<server-address>:${port}`;
    await ctx.reply(`${config.botName} dashboard\n${base}/?t=${t}\n\nKeep this link private. ${rotate ? 'Old link is now dead.' : `Reset it with ${config.prefix}dashboard rotate.`}`);
  },
};
