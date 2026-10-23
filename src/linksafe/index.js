import { requestPublic, fetchPublic } from '../utilities/validation.js';
import dns from 'node:dns/promises';
import net from 'node:net';
const SHORT = new Set(['bit.ly','tinyurl.com','t.co','goo.gl','is.gd','cutt.ly','rb.gy','ow.ly','shorturl.at','tiny.cc','buff.ly','rebrand.ly']);
const BAD_TLD = new Set(['zip','mov','xyz','top','click','ink','ml','tk','ga','cf','gq','icu','work','rest','country','support']);
const BRANDS = ['paypal','google','amazon','facebook','instagram','whatsapp','netflix','apple','microsoft','sbi','hdfc','icici','paytm','phonepe','flipkart'];
const feeds = { set: new Set(), at: 0, busy: false };
export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^(fc|fd|fe80)/i.test(ip) || /^::ffff:/i.test(ip);
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
export function extractUrl(text) {
  const m = String(text || '').match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
  return m ? m[0].replace(/[).,!?]+$/, '') : null;
}
export function heuristics(raw) {
  const flags = []; let score = 0; let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw); } catch { return { score: 0, flags: ['Not a valid link'], host: '' }; }
  const host = u.hostname.toLowerCase();
  const add = (n, t) => { score += n; flags.push(t); };
  if (u.protocol === 'http:') add(1, 'No HTTPS (not encrypted)');
  if (net.isIP(host)) add(3, 'Raw IP address instead of a name');
  if (host.includes('xn--')) add(3, 'Look-alike (punycode) domain');
  if (SHORT.has(host)) add(1, 'Shortened link, real target hidden');
  const tld = host.split('.').pop();
  if (BAD_TLD.has(tld)) add(2, `Risky .${tld} ending`);
  if (u.username || raw.includes('@')) add(2, 'Has a hidden user@ part');
  if (host.split('.').length > 4) add(1, 'Very many subdomains');
  const base = host.split('.').slice(-2).join('.');
  for (const b of BRANDS) if (host.includes(b) && !base.startsWith(b + '.')) { add(3, `Pretends to be ${b}`); break; }
  if (/(login|verify|secure|update|account|wallet|gift|prize|kyc)/i.test(u.pathname + host)) add(1, 'Bait words (login/verify/prize)');
  if (/\.(apk|exe|scr|bat|msi|jar)(\?|$)/i.test(u.pathname)) add(3, 'Direct app/program download');
  return { score, flags, host };
}
async function refreshFeeds() {
  if (feeds.busy || Date.now() - feeds.at < 3600e3) return;
  feeds.busy = true;
  try {
    const s = new Set();
    for (const f of ['https://urlhaus.abuse.ch/downloads/text_online/', 'https://openphish.com/feed.txt']) {
      try {
        // Guarded fetch: DNS validated + pinned, redirect hops revalidated, body capped. Raw fetch with
        // unvalidated redirect:follow could be pointed at internal addresses by a compromised feed host.
        const r = await fetchPublic(f, { maxBytes: 16 * 1024 * 1024, timeoutMs: 15000, headers: { 'user-agent': 'Mozilla/5.0' } });
        if (r.status < 200 || r.status >= 300) continue;
        for (const l of r.body.toString('utf8').split('\n')) { const x = l.trim(); if (x.startsWith('http') && s.size < 120000) s.add(x.replace(/\/$/, '').toLowerCase()); }
      } catch { /* feed down */ }
    }
    if (s.size) { feeds.set = s; }
    feeds.at = Date.now();
  } finally { feeds.busy = false; }
}
export async function inFeeds(url) {
  await refreshFeeds();
  const k = url.replace(/\/$/, '').toLowerCase();
  if (feeds.set.has(k)) return true;
  try { const u = new URL(k); return feeds.set.has((u.origin + u.pathname).replace(/\/$/, '')); } catch { return false; }
}
export async function expand(raw, max = 4) {
  const chain = []; let cur = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw;
  for (let i = 0; i < max; i++) {
    const u = new URL(cur);
    if (!net.isIP(u.hostname)) { const a = await dns.lookup(u.hostname, { all: true }).catch(() => []); if (!a.length || a.some((x) => isPrivateIp(x.address))) break; }
    else if (isPrivateIp(u.hostname)) break;
    let r;
    try { r = await requestPublic(cur, { method: 'HEAD', follow: false, timeoutMs: 6000, headers: { 'user-agent': 'Mozilla/5.0' } }); } catch { break; }
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).href; chain.push(cur); } else break;
  }
  return chain;
}
export async function check(raw) {
  const h = heuristics(raw); let { score } = h; const flags = [...h.flags];
  let chain = [];
  try { chain = await expand(raw); } catch { /* ignore */ }
  const final = chain.length ? chain[chain.length - 1] : null;
  if (final) { const h2 = heuristics(final); score += h2.score; for (const f of h2.flags) if (!flags.includes(f)) flags.push(f); }
  if (chain.length > 2) { score += 1; flags.push('Many redirects'); }
  let listed = await inFeeds(raw);
  if (!listed && final) listed = await inFeeds(final);
  if (listed) { score += 10; flags.push('Listed in public phishing/malware feeds'); }
  const verdict = score >= 5 ? 'DANGEROUS' : score >= 2 ? 'SUSPICIOUS' : 'LOOKS OK';
  return { verdict, score, flags, final, hops: chain.length };
}
