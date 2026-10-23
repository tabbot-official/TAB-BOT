import path from 'node:path';import dns from 'node:dns/promises';import net from 'node:net';
export function limitedText(text,max=2000){if(typeof text!=='string'||!text.trim())throw new Error('Input is empty');if(Buffer.byteLength(text,'utf8')>max)throw new Error(`Input is too long (maximum ${max} UTF-8 bytes)`);return text;}
export function zipPath(name){if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[A-Za-z]:/.test(name))throw new Error('Unsafe archive path');const p=path.posix.normalize(name);if(p==='..'||p.startsWith('../')||name.split('/').includes('..'))throw new Error('Unsafe archive path');return p;}
export function privateIP(ip){if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&(p[1]===168||p[1]===0||p[1]===2))||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===198&&[18,19].includes(p[1]));}if(net.isIP(ip)===6){const t=ip.toLowerCase();return !/^[23]/.test(t)||t.startsWith('2001:')||t.startsWith('2002:')|| t==='::'||t==='::1'||t.startsWith('fc')||t.startsWith('fd')||/^fe[89ab]/.test(t)||t.startsWith('::ffff:')||t.startsWith('ff');}return true;}
export function safeName(name,fallback='file'){let n;try{n=decodeURIComponent(String(name||''));}catch{n=String(name||'');}n=n.replace(/[\/\\]/g,'_').replace(/[\0-\u001f]/g,'').replace(/^\.+/, '').trim().slice(0,80);return n||fallback;}
export async function publicURL(text,lookup=dns.lookup){let u;try{u=new URL(text);}catch{throw new Error('Invalid URL');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!['','80','443'].includes(u.port))throw new Error('Only public HTTP/HTTPS URLs are allowed');const host=u.hostname.replace(/^\[|\]$/g,'');const ips=net.isIP(host)?[{address:host}]:await lookup(host,{all:true});if(!ips.length||ips.some(x=>privateIP(x.address)))throw new Error('Private/local network URLs are blocked');return u;}

import http from 'node:http';
import https from 'node:https';

/** One validated request to a user-influenced URL: every redirect hop is
 *  re-validated with publicURL (http/https, ports 80/443, no credentials, all
 *  resolved IPs public) and the connection is pinned to a validated address,
 *  so a public-looking URL cannot redirect or rebind into private/internal
 *  targets. `body` (string/Buffer) sends a request body (content-length set
 *  automatically). Returns { status, headers, stream, finalUrl }; the caller
 *  must consume or destroy the stream. With follow:false, redirect responses
 *  are returned to the caller (stream already drained) instead of followed. */
export async function requestPublic(text, { method = 'GET', timeoutMs = 20000, headers = {}, body, depth = 0, follow = true } = {}) {
  if (depth > 3) throw new Error('Too many redirects');
  const u = await publicURL(text);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true });
  if (!records.length || records.some((x) => privateIP(x.address))) throw new Error('That address is not allowed (private or unreachable).');
  const chosen = records.find((x) => x.family === 4) || records[0];
  const hdrs = { 'Accept-Encoding': 'identity', ...headers };
  if (body != null && !Object.keys(hdrs).some((k) => k.toLowerCase() === 'content-length')) hdrs['content-length'] = Buffer.byteLength(body);
  const res = await new Promise((ok, no) => {
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method,
      headers: hdrs,
      lookup: (_h, opts, cb) => cb(null, opts.all ? [chosen] : chosen.address, chosen.family),
    }, (r) => ok(r));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timed out')));
    req.on('error', no);
    req.end(body);
  });
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
    res.resume();
    if (!follow) return { status: res.statusCode, headers: res.headers, stream: null, finalUrl: u.href };
    return requestPublic(new URL(res.headers.location, u).href, { method, timeoutMs, headers, body, depth: depth + 1, follow });
  }
  return { status: res.statusCode, headers: res.headers, stream: res, finalUrl: u.href };
}

/** Buffered variant: whole body in memory, hard-capped. */
export async function fetchPublic(text, { maxBytes = 2 * 1024 * 1024, timeoutMs = 20000, headers = {} } = {}) {
  const r = await requestPublic(text, { timeoutMs, headers });
  const body = await new Promise((ok, no) => {
    let n = 0; const chunks = [];
    r.stream.on('data', (c) => { n += c.length; if (n > maxBytes) { r.stream.destroy(); no(new Error('Response too large')); } else chunks.push(c); });
    r.stream.on('end', () => ok(Buffer.concat(chunks)));
    r.stream.on('error', no);
  });
  return { status: r.status, headers: r.headers, body, finalUrl: r.finalUrl };
}

/** Streaming variant: pipe to a destination with a byte cap (for large media). */
export async function fetchPublicStream(text, { maxBytes = 100 * 1024 * 1024, timeoutMs = 60000, headers = {} } = {}) {
  const r = await requestPublic(text, { timeoutMs, headers });
  const { Transform } = await import('node:stream');
  let n = 0;
  const counter = new Transform({ transform(c, _e, cb) { n += c.length; n > maxBytes ? cb(new Error('Response too large')) : cb(null, c); } });
  r.stream.on('error', (e) => counter.destroy(e));
  return { status: r.status, headers: r.headers, stream: r.stream.pipe(counter), finalUrl: r.finalUrl };
}
