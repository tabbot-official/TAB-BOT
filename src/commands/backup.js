import config from '../config/config.js';
import { buildBackup } from '../utils/backup.js';
export default {
  name: 'backup', aliases: ['exportdata'], category: 'System', ownerOnly: true,
  description: 'Owner: export your bot settings and data as a zip',
  usage: 'backup', minArgs: 0,
  async run(ctx) {
    if (ctx.isGroup) return ctx.reply('Use this in your private chat only.');
    const { buffer, files } = buildBackup(config.paths.data);
    if (!files.length) return ctx.reply('There is no data to back up yet.');
    const day = new Date().toISOString().slice(0, 10);
    await ctx.sock.sendMessage(ctx.jid, { document: buffer, mimetype: 'application/zip', fileName: `tab-backup-${day}.zip`, caption: `💾 Backup of ${files.length} data file${files.length > 1 ? 's' : ''}. It has no WhatsApp session, keys or .env. To restore: stop the bot, copy the files into the data folder, start the bot.` }, { quoted: ctx.msg });
  },
};
