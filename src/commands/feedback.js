import {telemetry, getCollector} from '../telemetry/index.js';
import {valid, MIN, MAX} from '../telemetry/feedback.js';
import {enabled} from '../telemetry/client.js';
import config from '../config/config.js';

const WHY = {
  off: 'Feedback is sent through the same channel as the anonymous install ping, and that is switched off on this bot (Tab keeps TELEMETRY off by default). For the original Jarvis project, open an issue at https://github.com/nicholas-pp8/jarvis-whatsapp-bot/issues instead.',
  short: `Please write at least ${MIN} characters so the maintainer can understand it.`,
  wait: 'You just sent feedback. Please wait 10 minutes before sending another.',
  daily: 'This bot already sent 5 feedback messages today. Please try again tomorrow.',
  rejected: 'The maintainer could not accept that message. Try again in a minute, and make sure the bot has been online for a little while.',
  down: 'Could not reach the maintainer right now. Please try again later.',
};
export default {
  name: 'feedback', aliases: ['report', 'suggest'], category: 'General',
  description: 'Report a problem or ask for a feature', usage: 'feedback <your message>', minArgs: 1,
  async run(ctx) {
    const text = ctx.args.join(' ');
    if (!valid(text)) return ctx.reply(WHY.short);
    // On the maintainer's own server the message goes straight into the local inbox.
    const col = getCollector();
    if (col) { const r = col.feedback({v: 1, k: 'fb', id: telemetry.id, t: text}); return ctx.reply(r ? '✅ Saved to your dashboard feedback list.' : 'Not saved (rate limit or install not registered yet).'); }
    if (!enabled()) return ctx.reply(WHY.off);
    const r = await telemetry.sendFeedback(text, ctx.sender);
    await ctx.reply(r.ok ? `✅ Thank you! Your message was sent to the original Jarvis maintainer together with this install's S-ID (${telemetry.sid || 'pending'}). Only the text is sent (phone numbers and e-mails are removed), never your number or chats.` : WHY[r.why] || WHY.down);
  },
};
