// MEDIAFIRE: resolve a MediaFire page to its direct file and send it. 20 MB cap.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { fetchPublic, safeName } from '../utilities/validation.js';

const MAX_BYTES = 20 * 1024 * 1024;

export default {
  name: 'mediafire', aliases: ['mfdl'], category: 'Download',
  description: 'Download a MediaFire file (max 20 MB)',
  usage: 'mediafire <mediafire link>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('mediafire')) return ctx.reply('MediaFire downloads are turned off right now.');
    const url = ctx.args[0] || '';
    let pageHost = '';
    try { pageHost = new URL(url).hostname; } catch { return ctx.reply('Send a MediaFire file link.'); }
    if (pageHost !== 'www.mediafire.com' && pageHost !== 'mediafire.com' && !pageHost.endsWith('.mediafire.com')) return ctx.reply('Send a MediaFire file link.');
    const dir = path.join(config.paths.temp, 'mf-' + Date.now());
    try {
      await ctx.reply('⏳ Resolving the MediaFire link...');
      const page = await fetchPublic(url, { timeoutMs: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
      const html = page.body.toString('utf8');
      const dm = html.match(/id="downloadButton"[^>]*href="([^"]+)"/) || html.match(/href="(https?:\/\/download\d+\.mediafire\.com\/[^"]+)"/);
      if (!dm) return ctx.reply('⚠️ Could not find the file on that page (folder links and expired files are not supported).');
      const direct = dm[1];
      const name = safeName(direct.split('/').pop().split('?')[0], 'mediafire-file');
      const r = await fetchPublic(direct, { maxBytes: MAX_BYTES + 1, timeoutMs: 120000 });
      if (r.status !== 200) return ctx.reply('⚠️ The file would not download.');
      const bytes = r.body.length;
      if (bytes > MAX_BYTES) return ctx.reply('⚠️ That file is over 20 MB - too big to send here.');
      await fs.promises.mkdir(dir, { recursive: true });
      const out = path.join(dir, name);
      fs.writeFileSync(out, r.body);
      await ctx.sock.sendMessage(ctx.jid, { document: { url: out }, mimetype: r.headers['content-type'] || 'application/octet-stream', fileName: name, caption: `📦 ${name} (${(bytes / 1048576).toFixed(1)} MB)` }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[mediafire] failed: ' + (e?.message || 'error'));
      await ctx.reply('⚠️ Could not download that file (' + (e?.message || 'error') + ').');
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
