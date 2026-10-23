import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {Telemetry} from './client.js';
import {Collector} from './collector.js';
import {numberHash} from './payload.js';
import {notify, pairedNumber} from '../ops/index.js';

const version = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return '0'; } })();
export const telemetry = new Telemetry({dir: config.paths.data, version, getNumber: () => pairedNumber() || config.ownerNumber, getPortalSid: () => config.ecosystem?.sid || '', isOnline: () => globalThis.__jarvisWA === 'online', log: (m) => logger.info(m)});
export const startTelemetry = () => telemetry.start();

let collector = null;
/** The collector exists only when this deployment sets TELEMETRY_COLLECTOR=on (the owner's server). */
export function getCollector() {
  if (String(process.env.TELEMETRY_COLLECTOR || '').toLowerCase() !== 'on') return null;
  if (!collector) {
    collector = new Collector({file: path.join(config.paths.data, 'telemetry-installs.json'), ownerHash: numberHash(config.ownerNumber), ownerInstallId: telemetry.id, notify});
    const t = setInterval(() => collector.flush(String(process.env.TELEMETRY_NOTIFY || 'on').toLowerCase() !== 'off').catch(() => {}), 60000); t.unref?.();
  }
  return collector;
}

let gh = {at: 0, v: null};
/** Public repo counters, cached for an hour. */
export async function githubStats(fetchFn = globalThis.fetch) {
  if (gh.v && Date.now() - gh.at < 3600000) return gh.v;
  try {
    const r = await fetchFn('https://api.github.com/repos/nicholas-pp8/jarvis-whatsapp-bot', {headers: {'user-agent': 'jarvis-dashboard', accept: 'application/vnd.github+json'}, signal: AbortSignal.timeout(6000)});
    if (r.ok) { const j = await r.json(); gh = {at: Date.now(), v: {stars: j.stargazers_count | 0, forks: j.forks_count | 0, watchers: j.subscribers_count | 0}}; }
  } catch { /* keep the last value */ }
  gh.at = gh.v ? gh.at : Date.now() - 3000000;
  return gh.v;
}
