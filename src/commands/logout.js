import { logout } from '../auth/ownerAuth.js';

export default {
  name: 'logout',
  category: 'General',
  description: 'Lock owner commands again',
  usage: 'logout',
  async run(ctx) {
    if (!ctx.isOwner) return ctx.reply('Owner only.');
    logout();
    await ctx.reply('Logged out. Owner commands are locked until you log in again.');
  },
};
