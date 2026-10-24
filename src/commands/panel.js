// .panel - owner-only control of the bot's own hosting server (KataBump / any Pterodactyl panel).
// Needs PANEL_URL, PANEL_SERVER_ID and PANEL_API_KEY in .env. The key is never shown.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { panelConfig, getStatus, formatStatus, power, getConsoleLogs, localLogs, redact } from '../utilities/panel.js';

const CONFIRM_MS = 60_000;
const pending = new Map(); // signal -> expiry
export function _resetPanelConfirm() { pending.clear(); }

function help(p) {
  return [
    '🖥️ *Server panel* (owner only)',
    `${p}panel status - power state, RAM, CPU, disk`,
    `${p}panel restart - restart the bot through the panel`,
    `${p}panel logs [lines] - last console lines (private chat only)`,
    `${p}panel stop - take the bot offline (asks to confirm; start it again from the panel website)`,
  ].join('\n');
}

export default {
  name: 'panel',
  aliases: ['server'],
  category: 'Owner',
  description: 'Owner: hosting server status, restart, stop and logs (Pterodactyl / KataBump panel)',
  usage: 'panel status | restart | stop | logs [lines]',
  ownerOnly: true,
  async run(ctx) {
    const p = config.prefix || '.';
    if (!ctx.isOwner) return ctx.reply('🔒 Only the bot owner can control the server panel.');
    const sub = String(ctx.args[0] || 'status').toLowerCase();
    const arg = String(ctx.args[1] || '').toLowerCase();
    if (['help', '?'].includes(sub)) return ctx.reply(help(p));
    const cfg = panelConfig();
    if (!cfg.ok) {
      return ctx.reply('⚙️ The panel is not set up yet. Add these to .env and restart once:\n' +
        cfg.missing.map((k) => '- ' + k).join('\n') +
        '\n\nPANEL_URL = the panel website (e.g. https://control.katabump.com)\nPANEL_SERVER_ID = the short server id from the panel URL\nPANEL_API_KEY = a Client API key (panel > Account > API Credentials)');
    }
    try {
      if (sub === 'status' || sub === 'info') {
        return ctx.reply(formatStatus(await getStatus()));
      }
      if (sub === 'logs' || sub === 'log' || sub === 'console') {
        if (ctx.isGroup) return ctx.reply('📜 Logs can contain private details - use ' + p + 'panel logs in my private chat.');
        const n = Math.max(5, Math.min(60, Number(arg) || 25));
        let lines = [];
        let src = 'panel console';
        try { lines = await getConsoleLogs({ lines: n }); } catch (e) { logger.warn('[panel] console logs: ' + e.message); }
        if (!lines.length) { lines = await localLogs(n); src = 'bot log file'; }
        if (!lines.length) return ctx.reply('📜 No log lines found.');
        const body = lines.join('\n').slice(-3500);
        return ctx.reply('📜 Last ' + lines.length + ' lines (' + src + '):\n```\n' + body + '\n```');
      }
      if (sub === 'restart' || sub === 'reboot') {
        await ctx.reply('🔄 Restarting through the panel - back in about a minute.');
        logger.warn('[panel] owner requested a restart');
        await power('restart');
        return undefined;
      }
      if (sub === 'stop' || sub === 'kill') {
        const until = pending.get(sub) || 0;
        if (['yes', 'confirm'].includes(arg) && until > Date.now()) {
          pending.delete(sub);
          await ctx.reply(sub === 'kill' ? '⛔ Killing the server now.' : '⏹️ Stopping the server now. Start it again from the panel website.');
          logger.warn('[panel] owner confirmed ' + sub);
          await power(sub);
          return undefined;
        }
        pending.set(sub, Date.now() + CONFIRM_MS);
        return ctx.reply('⚠️ This takes me fully offline. I cannot start myself again from WhatsApp - only from the panel website.\nSend *' + p + 'panel ' + sub + ' yes* within 60 seconds to go ahead.');
      }
      if (sub === 'start') return ctx.reply('🟢 I am already running (you are talking to me).');
      return ctx.reply(help(p));
    } catch (e) {
      return ctx.reply('❌ ' + redact(e?.message || 'Panel error', cfg));
    }
  },
};
