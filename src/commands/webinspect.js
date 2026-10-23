// WEBINSPECT: fetch a URL and report title, status, size, server, redirects.
// SSRF guard: every hop (including redirects) is validated with publicURL and
// the connection is pinned to the validated address, so a validated public
// page cannot redirect or rebind the bot into private/internal targets.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { publicURL, privateIP } from '../utilities/validation.js';

const MAX_BODY = 512 * 1024;

function fetchValidated(url, redirectChain, depth = 0) {
  return (async () => {
    if (depth > 3) throw new Error('Too many redirects');
    const u = await publicURL(url); // http/https only, ports 80/443, no credentials, all resolved IPs public
    const records = net.isIP(u.hostname.replace(/^\[|\]$/g, ''))
      ? [{ address: u.hostname.replace(/^\[|\]$/g, ''), family: net.isIP(u.hostname.replace(/^\[|\]$/g, '')) }]
      : await dns.lookup(u.hostname, { all: true });
    if (!records.length || records.some((x) => privateIP(x.address))) throw new Error('That address is not inspectable (private or unreachable).');
    const chosen = records.find((x) => x.family === 4) || records[0];
    const res = await new Promise((ok, no) => {
      const req = (u.protocol === 'https:' ? https : http).get(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)', 'Accept-Encoding': 'identity' },
        // Pin the connection to the validated address: no re-resolution at connect time.
        lookup: (_host, opts, cb) => cb(null, opts.all ? [chosen] : chosen.address, chosen.family),
      }, (r) => {
        let n = 0; const chunks = [];
        r.on('data', (c) => { n += c.length; if (n > MAX_BODY) { r.destroy(); no(new Error('Page too large')); } else chunks.push(c); });
        r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
        r.on('error', no);
      });
      req.setTimeout(15000, () => req.destroy(new Error('Page timed out')));
      req.on('error', no);
    });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      const next = new URL(res.headers.location, u).href;
      redirectChain.push(next);
      return fetchValidated(next, redirectChain, depth + 1);
    }
    return { ...res, finalUrl: u.href, chain: redirectChain };
  })();
}

export default {
  name: 'webinspect', aliases: ['inspect', 'siteinfo'], category: 'Tools',
  description: 'Inspect a website: status, title, server, size',
  usage: 'webinspect <url>',
  async run(ctx) {
    if (!featOn('webinspect')) return ctx.reply('Web inspect is turned off right now.');
    let url = (ctx.args[0] || '').trim();
    if (!url) return ctx.reply('Give me a URL. Example: ' + config.prefix + 'webinspect https://example.com');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { return ctx.reply('That is not a valid URL.'); }
    try {
      const t0 = Date.now();
      const r = await fetchValidated(url, []);
      const ms = Date.now() - t0;
      const title = (r.body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().slice(0, 100) || '(no title)';
      const desc = (r.body.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) || [])[1]?.trim().slice(0, 150) || '';
      const kb = (Buffer.byteLength(r.body) / 1024).toFixed(1);
      const hops = r.chain.length ? '\n• Redirects: ' + r.chain.length + ' (each hop re-validated)' : '';
      return ctx.reply(`*Web inspect:* ${url}\n\n• Status: ${r.status}\n• Title: ${title}\n${desc ? '• About: ' + desc + '\n' : ''}• Server: ${r.headers['server'] || 'hidden'}\n• Type: ${(r.headers['content-type'] || '?').split(';')[0]}\n• Page size: ${kb} KB\n• Final URL: ${r.finalUrl}${hops}\n• Time: ${ms} ms`);
    } catch (e) {
      logger.warn('[webinspect] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not inspect that site (' + (e?.message || 'error') + ').');
    }
  },
};
