import {t} from '../i18n/index.js';
import {replyFailure} from '../recovery/reply.js';
// Shared flow for download commands (files starting with "_" are not loaded as commands).
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { fetchMedia } from '../downloaders/index.js';
import { DownloadError, downloadQueue, runYtDlp } from '../utils/downloader.js';
import { createJobDir, removeJobDir, freeDiskBytes } from '../utils/fileManager.js';
import { sendMediaFile } from '../utils/sender.js';
import { createProgressMessage } from '../utils/progressBar.js';
import { bump } from '../database/database.js';
import { formatBytes } from '../utils/helpers.js';

const require = createRequire(import.meta.url);
const socialUse=new Map();
import {PLATFORMS} from '../downloaders/platforms.js';
const SOCIAL_EXPECT=new Set(['instagram','facebook','twitter',...PLATFORMS.map(p=>p.name)]);
export function limitSocial(user,now=Date.now()){const recent=(socialUse.get(user)||[]).filter(t=>now-t<60000);if(recent.length>=3)throw new DownloadError('Public video limit: 3 requests per minute. Please wait a moment.');socialUse.set(user,[...recent,now]);if(socialUse.size>5000)socialUse.clear();}

/** Finds the top YouTube result for a text query via yt-search. Returns { url, title } or null. */
async function searchYtSearchPkg(query) {
  const yts = require('yt-search');
  const r = await Promise.race([
    yts(query),
    new Promise((_, rej) => setTimeout(() => rej(new Error('search timeout')), 20000)),
  ]);
  const v = (r?.videos || []).find((x) => x?.url);
  return v ? { url: v.url, title: v.title } : null;
}

/** Finds the top YouTube result via yt-dlp (Innertube). Different endpoint than the HTML page, rescues queries where the page comes back empty. */
async function searchYtDlp(query) {
  const { stdout } = await runYtDlp([`ytsearch5:${query}`, '--flat-playlist', '--print', '%(id)s\t%(title)s'], { timeoutMs: 25_000 });
  const line = stdout.split('\n').map((l) => l.trim()).find((l) => /^[\w-]{11}\t/.test(l));
  if (!line) return null;
  const [id, ...rest] = line.split('\t');
  return { url: `https://www.youtube.com/watch?v=${id}`, title: rest.join('\t').trim() || 'YouTube result' };
}

/** Search with fallbacks: yt-search first, then yt-dlp on the query and on safe variants. Returns { url, title } or null. */
export async function searchYoutube(query) {
  try {
    const hit = await searchYtSearchPkg(query);
    if (hit) return hit;
  } catch { /* fall through to yt-dlp */ }
  const variants = [query];
  if (!/\bsong\b/i.test(query)) variants.push(query + ' song');
  const by = query.match(/^(.*\S)\s+by\s+(\S.*)$/i);
  if (by) variants.push(`${by[2]} ${by[1]}`, `${by[1]} ${by[2]}`);
  for (const q of variants) {
    try {
      const hit = await searchYtDlp(q);
      if (hit) { if (q !== query) logger.info('Search rescued by variant'); return hit; }
    } catch { /* next variant */ }
  }
  return null;
}

/**
 * URL -> validator -> platform detector -> downloader -> file validation
 * -> WhatsApp sender -> temp cleanup.
 */
export async function runDownloadCommand(ctx, { expect, kind, label }) {
  let rawUrl = ctx.args[0];
  let dir = null; let preHit = null; let pinSearch = null;
  try {
    if(SOCIAL_EXPECT.has(expect))limitSocial(ctx.sender);
    if (expect === 'pinterest' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      let query = ctx.args.join(' ').trim();
      let wantVideo = false;
      const vm = query.match(/^(.*\S)[\s,]+videos?$/i);
      if (vm && vm[1].trim()) { wantVideo = true; query = vm[1].trim(); }
      // Search runs inside the download queue so a failed pin automatically rolls to the next fresh one.
      pinSearch = { query, wantVideo };
      rawUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
    }
    if (expect === 'youtube' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      const query = ctx.args.join(' ').trim();
      logger.info('Search started');
      let hit = null;
      try {
        hit = await searchYoutube(query);
      } catch (e) {
        logger.warn('Search failed');
        throw new DownloadError('❌ Search is not working right now. Please try again, or send a link.', { code: 'SEARCH_FAIL' });
      }
      if (!hit) throw new DownloadError(`🔎 No results found for "${query}". Try different words or send a link.`, { code: 'NO_RESULTS' });
      logger.info('Search result picked');
      await ctx.reply(`🔎 ${hit.title}`);
      rawUrl = hit.url;
    }
    if ((await freeDiskBytes()) < config.limits.minFreeDiskBytes) {
      throw new DownloadError('💾 The server is low on disk space. Please try again later.', { code: 'DISK' });
    }

    let progress = null;
    const result = await downloadQueue.add(
      ctx.sender,
      async () => {
        dir = await createJobDir();
        logger.info(`Download started (${label})`);
        if (expect === 'youtube') { progress = createProgressMessage(ctx, kind); await progress.begin(); }
        else await ctx.reply(SOCIAL_EXPECT.has(expect)?'Downloading public '+expect+' video...':'⏳ '+t(ctx,'cat_Downloaders')+': '+t(ctx,'desc_'+(expect==='youtube'?(kind==='audio'?'play':'video'):'pinterest')));
        let media;
        try {
          if (pinSearch) {
            const { searchAndDownload } = await import('../downloaders/pinterest.js');
            logger.info('Pin search started');
            let r;
            try { r = await searchAndDownload(pinSearch.query, { wantVideo: pinSearch.wantVideo, dir }); }
            catch (e) { logger.warn('Pin search failed'); throw new DownloadError('❌ Pinterest search is not working right now. Please try again, or send a pin link.', { code: 'SEARCH_FAIL', cause: e }); }
            if (r.status === 'none') throw new DownloadError(`🔎 No ${pinSearch.wantVideo ? 'video ' : ''}pins found for "${pinSearch.query}". Try different words or send a pin link.`, { code: 'NO_RESULTS' });
            if (r.status === 'exhausted') throw new DownloadError(`📌 I have already sent you every ${pinSearch.wantVideo ? 'video ' : ''}pin I could find for "${pinSearch.query}". Try different words for new pins.`, { code: 'NO_RESULTS' });
            if (r.status === 'failed') { logger.warn(`Pin search gave up after retries: ${(r.cause && (r.cause.userMessage || r.cause.message)) || 'unknown'}`); throw new DownloadError(`❌ I tried a few ${pinSearch.wantVideo ? 'video ' : ''}pins but none of them could be downloaded right now. Please try again, or send a pin link.`, { code: 'FAILED', cause: r.cause }); }
            logger.info('Pin search result picked');
            await ctx.reply(`📌 ${r.hit.title || ''}`);
            media = r.media;
          } else {
            media = preHit ? await (await import('../downloaders/pinterest.js')).downloadPinMedia(preHit.media, preHit.pin, preHit.id, { dir }) : await fetchMedia(rawUrl, { dir, kind, expect, onProgress: progress ? (p) => progress.update(p) : undefined });
          }
        }
        catch (e) { progress?.close(); throw e; }
        await progress?.finish(true);
        logger.info('Download completed');

        // File validation
        for (const f of media.files) {
          const st = await fs.stat(f.path).catch(() => null);
          if (!st || st.size === 0) throw new DownloadError('❌ The downloaded file was empty. Please try again.', { code: 'EMPTY' });
          if (st.size > config.limits.maxFileBytes) {
            throw new DownloadError(`📦 The file is ${formatBytes(st.size)}, which is over the ${formatBytes(config.limits.maxFileBytes)} limit.`, { code: 'TOO_LARGE' });
          }
          f.size = st.size;
        }

        for (const f of media.files){let first=true;try{await sendMediaFile(ctx.sock,ctx.jid,f,ctx.msg,f.type==='audio'?'':`✅ ${media.title}`,{onProgress:p=>{if(f.type!=='video')return;if(progress)progress.stage(p);else if(first){first=false;ctx.reply('Preparing the full video...').catch(()=>{});}}});}finally{}}

        logger.info('File sent');
        return media;
      },
      (pos) => ctx.reply('🕒 '+pos+' - '+t(ctx,'cat_Downloaders')).catch(() => {}),
    );
    bump('downloads');
    return result;
  } catch (err) {
    bump('failures');
    // E1: audio-only rescue - when YouTube blocks the video on this server IP, rescue the request as audio once.
    if(expect==='youtube'&&kind==='video'&&!ctx.__audioRescue){
      const code=String(err&&err.code||'');
      if(!['INVALID','PRIVATE','TOO_LONG','TOO_LARGE','DISK','SEARCH_FAIL','NO_RESULTS','LIVE'].includes(code)){
        ctx.__audioRescue=true;
        logger.warn('Video blocked, trying audio-only rescue');
        await ctx.reply('\u26a0\ufe0f YouTube blocked the video on this server. Sending the audio instead...').catch(()=>{});
        try{return await runDownloadCommand(ctx,{expect,kind:'audio',label});}finally{ctx.__audioRescue=false;}
      }
    }
    if((SOCIAL_EXPECT.has(expect)||expect==='youtube'||expect==='pinterest')&&err instanceof DownloadError&&err.userMessage) await ctx.reply(err.userMessage);
    else if(expect==='youtube'&&/exceeds size limit|outside the limit/i.test(String(err?.message||''))){logger.warn('Video too large after conversion');await ctx.reply('📦 That video is too big to send from this free server. Try a shorter clip, or use /play for audio only.').catch(()=>{});}
    else await replyFailure(ctx,expect==='youtube'?(kind==='audio'?'play':'video'):'pinterest',err);
  } finally {
    await removeJobDir(dir);
  }
  return null;
}
