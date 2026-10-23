// MEGA: download a public MEGA file link and send it back. Owner only, 20 MB cap.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { megaDownload } from '../utilities/mega.js';

export default {
  name: 'mega', aliases: ['megadl'], category: 'Download',
  description: 'Download a public MEGA file (max 20 MB)',
  usage: 'mega <mega.nz file link>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('mega')) return ctx.reply('MEGA downloads are turned off right now.');
    const url = ctx.args[0] || '';
    if (!/mega\.nz\//.test(url)) return ctx.reply('Send a MEGA file link. Example: ' + config.prefix + 'mega https://mega.nz/file/xxxx#yyyy');
    const dir = path.join(config.paths.temp, 'mega-' + Date.now());
    try {
      await ctx.reply('⏳ Fetching from MEGA...');
      const f = await megaDownload(url, dir);
      await ctx.sock.sendMessage(ctx.jid, { document: { url: f.path }, mimetype: 'application/octet-stream', fileName: f.name, caption: `📦 ${f.name} (${(f.size / 1048576).toFixed(1)} MB)` }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[mega] failed: ' + (e?.message || 'error'));
      const msg = /error -?(2|9|16)/.test(e?.message || '') ? 'That MEGA link is not available (removed or wrong key).' : (e?.message || 'Could not download that file.');
      await ctx.reply('⚠️ ' + msg);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
