import settings from '../config/settings.js';
import { authEnabled, isLoggedIn, issueCode } from './ownerAuth.js';
import { ownerChatJid } from '../utilities/owner.js';
import logger from '../utils/logger.js';

/** True when the command may run. Otherwise it has already told the owner how to log in. */
export async function ownerGate(ctx, cmd) {
  if (!cmd.ownerOnly || !ctx.isOwner || !authEnabled() || !settings.auth.lockOwnerCommands) return true;
  if ((settings.auth.exemptCommands || []).includes(cmd.name) || isLoggedIn()) return true;
  await sendLoginCode(ctx);
  return false;
}

export async function sendLoginCode(ctx) {
  const issued = issueCode();
  if (issued.wait) { await ctx.reply(`Login required. A code was just sent to your own chat. Wait ${issued.wait}s for a new one.`); return; }
  try {
    // The code goes only to the owner's own chat, never to the chat the command came from.
    await ctx.sock.sendMessage(ownerChatJid(ctx.sock), { text: `Tab login code: ${issued.code}\nValid for ${issued.minutes} minutes. Send: ${ctx.prefix || '/'}login ${issued.code}` });
    await ctx.reply('Login required. I sent a one-time code to your own chat.');
  } catch (err) {
    logger.warn('Owner login code could not be delivered');
    await ctx.reply('Login required, but I could not reach your own chat to send the code.');
  }
}
