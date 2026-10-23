import {telemetry} from '../telemetry/index.js';
import {enabled} from '../telemetry/client.js';
import {getCollector} from '../telemetry/index.js';
import {activeDirective} from '../telemetry/enforce.js';
import config from '../config/config.js';

const SID = /^S-[A-Z0-9]{6}$/;
/** Owner-only controls. They exist only on the maintainer's collector server. */
async function admin(ctx, sub) {
  const col = getCollector();
  if (!ctx.isOwner || !col) return ctx.reply('That option is only available to the maintainer on the collector server.');
  if (sub === 'flags') {
    const rows = Object.values(col.db.installs).filter((i) => !i.owner && (i.flags || []).length).sort((a, b) => b.flags.length - a.flags.length).slice(0, 15);
    return ctx.reply(rows.length ? '🚩 *Flagged installs*\n' + rows.map((i) => `${i.sid}: ${i.flags.map((f) => f.k + ' x' + f.n).join(', ')}`).join('\n') : 'No flagged installs.');
  }
  const id = String(ctx.args[1] || '').toUpperCase();
  if (!SID.test(id)) return ctx.reply(`Usage: ${config.prefix}sid ${sub} S-XXXXXX${sub === 'limit' ? ' [per-minute 1-60] [days 1-30]' : sub === 'suspend' ? ' [days 1-30]' : ''}`);
  const r = sub === 'limit' ? col.setDirective(id, 'limit', Number(ctx.args[3]) || 7, Number(ctx.args[2]) || 6) : col.setDirective(id, sub, Number(ctx.args[2]) || 7);
  if (!r.ok) return ctx.reply('Not done: ' + r.why + '.');
  await ctx.reply(sub === 'clear' ? `✅ ${id}: restrictions will be lifted at its next ping.` : `✅ ${id}: ${sub} for ${r.dir.days} day(s)${r.dir.lim ? ', ' + r.dir.lim + ' commands/min/user' : ''}. It takes effect at that install's next ping (within 24 h) and only if its bot has the current public key.`);
}

export default {
  name: 'sid', aliases: ['installid'], category: 'System',
  description: 'Show this install\'s S-ID and what the anonymous ping sends', usage: 'sid', minArgs: 0,
  async run(ctx) {
    const sub = String(ctx.args?.[0] || '').toLowerCase();
    if (['flags', 'suspend', 'limit', 'clear'].includes(sub)) return admin(ctx, sub);
    const sid = telemetry.sid;
    const dr = activeDirective(config.paths.data);
    if (dr) { const left = Math.max(1, Math.ceil((dr.exp - Date.now()) / 86400000)); return ctx.reply(`🆔 *Install S-ID:* ${sid || 'not registered yet'}\n\n⚠️ The original Jarvis maintainer has ${dr.act === 'suspend' ? 'suspended this install' : `limited this install to ${dr.lim} commands per minute per user`} for about ${left} more day(s). This is applied by a signed directive received through the telemetry ping (see the README, Telemetry section). Questions: contact the maintainer with your S-ID.`); }
    const lines = [`🆔 *Install S-ID:* ${sid || 'not registered yet (appears after the first ping)'}`];
    if (config.ecosystem?.sid) lines.push(`🔗 *Portal S-ID:* ${config.ecosystem.sid}`);
    if (!enabled()) { lines.push('Telemetry is OFF (TELEMETRY=off). Nothing is sent.'); return ctx.reply(lines.join('\n')); }
    lines.push('', 'The anonymous ping sends only: a random install id, bot version, uptime, connected yes/no, a one-way hash of the paired number, a one-way hash of your portal S-ID (only if you set one in settings.js), and how many times each built-in command ran.', 'Never sent: messages, chats, contacts, group names, files, or raw phone numbers. Turn it off with TELEMETRY=off.');
    await ctx.reply(lines.join('\n'));
  },
};
