// Webhooks: HMAC-SHA256 signed deliveries with retries. HTTPS only, private/loopback targets refused (SSRF guard), max 10 subscriptions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import config from '../../config/config.js';
import {bus} from '../events/bus.js';
import {badRequest} from '../errors.js';
import {log} from '../logger.js';
import {requestPublic} from '../../utilities/validation.js';

export const EVENT_TYPES = ['connection.changed', 'session.revoked', 'bot.restart', 'plugin.changed', 'webhook.test'];
const file = () => path.join(config.paths.data, 'api-webhooks.json');
const load = () => { try { const d = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(d) ? d : []; } catch { return []; } };
const save = (l) => { fs.mkdirSync(path.dirname(file()), {recursive: true}); fs.writeFileSync(file() + '.tmp', JSON.stringify(l), {mode: 0o600}); fs.renameSync(file() + '.tmp', file()); };

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('::ffff:'); }
  return true;
}
export async function checkUrl(url, lookup = dns.lookup) {
  let u; try { u = new URL(url); } catch { throw badRequest('Invalid URL'); }
  if (u.protocol !== 'https:') throw badRequest('Webhook URL must use https');
  if (u.username || u.password) throw badRequest('No credentials in the URL');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) { if (isPrivateIp(host)) throw badRequest('That address is not allowed'); return u; }
  let addrs; try { addrs = await lookup(u.hostname, {all: true}); } catch { throw badRequest('Host does not resolve'); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw badRequest('That address is not allowed');
  return u;
}
export const sign = (secret, ts, body) => 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');

export async function create({url, events}, lookup) {
  const l = load(); if (l.length >= 10) throw badRequest('Webhook limit reached (10)');
  await checkUrl(url, lookup);
  if (events !== undefined && (!Array.isArray(events) || events.some((e) => typeof e !== 'string'))) throw badRequest('events must be an array of strings');
  const ev = (events && events.length ? events : EVENT_TYPES); for (const e of ev) if (!EVENT_TYPES.includes(e)) throw badRequest('Unknown event: ' + e);
  const w = {id: 'wh_' + crypto.randomBytes(4).toString('hex'), url, events: ev, secret: crypto.randomBytes(24).toString('base64url'), created: Date.now(), failures: 0};
  l.push(w); save(l); return w;
}
export const list = () => load().map(({id, url, events, created, failures}) => ({id, url, events, created, failures}));
export function remove(id) { const l = load(); const n = l.filter((w) => w.id !== id); if (n.length === l.length) return false; save(n); return true; }

const DELAYS = [5000, 30000, 300000];
export class Dispatcher {
  // Delivery goes through requestPublic: the URL is re-validated and the connection is PINNED to the
  // validated address, so DNS cannot rebind between the check and the actual request. follow:false
  // (redirects are never followed for webhooks). requestFn is injectable for tests.
  constructor({requestFn = requestPublic, delays = DELAYS, lookup = dns.lookup, now = () => Date.now()} = {}) { this.requestFn = requestFn; this.delays = delays; this.lookup = lookup; this.now = now; this.queued = 0; this.timers = new Set(); }
  async deliver(w, event, attempt = 0) {
    const body = JSON.stringify({id: crypto.randomBytes(6).toString('hex'), type: event.type, at: event.at, data: event.data}); const ts = String(Math.floor(this.now() / 1000));
    try {
      await checkUrl(w.url, this.lookup); // policy gate: https only, no credentials, no private targets
      const r = await this.requestFn(w.url, {method: 'POST', follow: false, timeoutMs: 5000, headers: {'content-type': 'application/json', 'x-jarvis-event': event.type, 'x-jarvis-timestamp': ts, 'x-jarvis-signature': sign(w.secret, ts, body)}, body});
      r.stream?.resume?.(); // free the socket; only the status matters
      if (r.status >= 200 && r.status < 300) return true;
      throw new Error('status ' + r.status);
    } catch (e) {
      if (attempt < this.delays.length && this.queued < 200) { this.queued++; const t = setTimeout(() => { this.timers.delete(t); this.queued--; this.deliver(w, event, attempt + 1).catch(() => {}); }, this.delays[attempt]); t.unref?.(); this.timers.add(t); }
      else log('warn', 'webhook gave up', {id: w.id, type: event.type, err: String(e.message).slice(0, 80)});
      return false;
    }
  }
  dispatch(event) { for (const w of load()) if (w.events.includes(event.type)) this.deliver(w, event).catch(() => {}); }
  stop() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
}
let dispatcher = null;
export function startDispatcher() { if (dispatcher) return dispatcher; dispatcher = new Dispatcher(); bus.on('event', (e) => dispatcher.dispatch(e)); return dispatcher; }
