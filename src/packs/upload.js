import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { findMedia } from '../utils/imageTools.js';
import { health } from './_net.js';
// Upload chain: catbox -> litterbox -> uguu -> tmpfiles. Free, no key. Links from the last three are temporary.
const MAX = 20 * 1048576;
const form = (field, buf, name, extra = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(extra)) f.append(k, v); f.append(field, new Blob([buf]), name); return f; };
const okUrl = (s) => { const m = String(s).trim().match(/^https?:\/\/[^\s"'<>]+$/); return m ? m[0] : null; };
export const HOSTS = [
  { id: 'catbox', note: 'permanent', send: (b, n, F) => F('https://catbox.moe/user/api.php', { method: 'POST', body: form('fileToUpload', b, n, { reqtype: 'fileupload' }) }), parse: async (r) => okUrl(await r.text()) },
  { id: 'litterbox', note: 'kept 72 hours', send: (b, n, F) => F('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: form('fileToUpload', b, n, { reqtype: 'fileupload', time: '72h' }) }), parse: async (r) => okUrl(await r.text()) },
  { id: 'uguu', note: 'kept about 3 hours', send: (b, n, F) => F('https://uguu.se/upload?output=text', { method: 'POST', body: form('files[]', b, n) }), parse: async (r) => okUrl(await r.text()) },
  { id: 'tmpfiles', note: 'kept about 1 hour', send: (b, n, F) => F('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form('file', b, n) }), parse: async (r) => { const u = (await r.json())?.data?.url; return u && okUrl(u.replace('tmpfiles.org/', 'tmpfiles.org/dl/')); } },
];
export async function uploadChain(buf, name, fetchImpl = (...a) => fetch(...a)) {
  if (!buf?.length) throw new Error('empty file');
  if (buf.length > MAX) throw new Error('file is over 20MB');
  const safe = String(name || 'file.bin').replace(/[^\w.\-]/g, '_').slice(0, 60);
  const errs = [];
  for (const h of HOSTS) {
    const rec = health.get(`upload:${h.id}`) || { ok: 0, fail: 0, consecutiveFail: 0 }; health.set(`upload:${h.id}`, rec);
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
      let r; try { r = await h.send(buf, safe, (u, o) => fetchImpl(u, { ...o, signal: ctl.signal })); } finally { clearTimeout(t); }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const url = await h.parse(r); if (!url) throw new Error('no link returned');
      rec.ok++; rec.consecutiveFail = 0; rec.lastOk = Date.now(); return { url, host: h.id, note: h.note };
    } catch (e) { rec.fail++; rec.consecutiveFail++; rec.lastFail = Date.now(); rec.lastError = String(e.message).slice(0, 100); errs.push(`${h.id}: ${e.message}`); }
  }
  throw new Error(`all upload hosts failed (${errs.join('; ')})`);
}
const mk = (name, description, extra) => ({
  name, category: 'Upload', description, usage: `${name} (send or reply to a file, photo or video)`, aliases: [], minArgs: 0, pack: true, web: true, ownerOnly: false, group: false, image: true,
  tests: [['', 'file']], fn: null,
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media) return ctx.reply(`Send or reply to a file, photo or video with /${name}`);
    if (Number(media.node?.fileLength) > MAX) return ctx.reply('That file is over 20MB.');
    try {
      const buf = await downloadMediaMessage(media.message, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
      const ext = { image: 'jpg', video: 'mp4', sticker: 'webp' }[media.type] || 'bin';
      const r = await uploadChain(buf, media.node?.fileName || `tab.${ext}`);
      await ctx.reply(`Uploaded to ${r.host} (${r.note}):\n${r.url}\n${extra}\nAnyone with the link can open it. Do not upload private files.`);
    } catch (e) { await ctx.reply(`Upload failed: ${e.message}`); }
  },
});
export default [
  mk('upload', 'Upload a file to a free host and get a link', 'Tries catbox, then litterbox, uguu and tmpfiles.'),
  mk('catbox', 'Upload a file to catbox (falls back to other free hosts)', 'Catbox links are permanent; fallback hosts are temporary.'),
  mk('imgur', 'Get a public image link (free hosts, not imgur.com)', 'Note: this link may not be from imgur.com. It uses free no-key hosts instead.'),
];
