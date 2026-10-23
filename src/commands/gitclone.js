// GITCLONE: download a public GitHub repo as a zip and send it. Streams to disk, 30 MB cap.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const MAX_BYTES = 30 * 1024 * 1024;

export default {
  name: 'gitclone', aliases: ['ghclone'], category: 'Download',
  description: 'Send a public GitHub repo as a zip',
  usage: 'gitclone <github repo url>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('gitclone')) return ctx.reply('Git clone is turned off right now.');
    const m = (ctx.args[0] || '').match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
    if (!m) return ctx.reply('Send a GitHub repo link. Example: ' + config.prefix + 'gitclone https://github.com/user/repo');
    const [owner, repo] = [m[1], m[2].replace(/\.git$/, '')];
    const dir = path.join(config.paths.temp, 'gh-' + Date.now());
    try {
      await ctx.reply('⏳ Getting the repo...');
      const meta = await (await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { 'User-Agent': 'JarvisBot' }, signal: AbortSignal.timeout(15000) })).json();
      if (meta.message) return ctx.reply('⚠️ Repo not found or private.');
      const branch = meta.default_branch || 'main';
      const r = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!r.ok || !r.body) return ctx.reply('⚠️ Could not download that repo.');
      if (Number(r.headers.get('content-length') || 0) > MAX_BYTES) return ctx.reply('⚠️ That repo zip is over 30 MB - too big to send here.');
      await fs.promises.mkdir(dir, { recursive: true });
      const out = path.join(dir, `${repo}-${branch}.zip`);
      let bytes = 0;
      const ws = fs.createWriteStream(out);
      await new Promise((res, rej) => {
        Readable.fromWeb(r.body).on('data', (c) => { bytes += c.length; if (bytes > MAX_BYTES) { ws.destroy(); rej(new Error('over 30 MB')); } })
          .pipe(ws).on('finish', res).on('error', rej);
      });
      await ctx.sock.sendMessage(ctx.jid, { document: { url: out }, mimetype: 'application/zip', fileName: path.basename(out), caption: `📦 ${owner}/${repo} (${branch}) - ${(bytes / 1048576).toFixed(1)} MB` }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[gitclone] failed: ' + (e?.message || 'error'));
      await ctx.reply('⚠️ Could not clone that repo (' + (e?.message || 'error') + ').');
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
