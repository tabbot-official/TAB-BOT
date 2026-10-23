import config from '../config/config.js';
import { authEnabled, verifyCode, isLoggedIn, sessionMinutesLeft } from '../auth/ownerAuth.js';
import { sendLoginCode } from '../auth/gate.js';

export default {
  name: 'login',
  category: 'General',
  description: 'Owner login with a one-time code sent to your own chat',
  usage: 'login  (then: login <code>)',
  async run(ctx) {
    if (!ctx.isOwner) return ctx.reply('Owner only.');
    if (!authEnabled()) return ctx.reply('Owner login is switched off in settings.js.');
    ctx.prefix = config.prefix;
    const code = ctx.args[0];
    if (!code) return isLoggedIn() ? ctx.reply(`Already logged in. ${sessionMinutesLeft()} min left.`) : sendLoginCode(ctx);
    const r = verifyCode(code);
    const msg = { ok: `Logged in. Owner commands unlocked for ${sessionMinutesLeft()} min.`, none: `No active code. Send ${config.prefix}login for a new one.`, expired: `That code expired. Send ${config.prefix}login for a new one.`, locked: `Too many wrong tries. Send ${config.prefix}login for a new code.`, wrong: 'Wrong code.' }[r];
    await ctx.reply(msg);
  },
};
