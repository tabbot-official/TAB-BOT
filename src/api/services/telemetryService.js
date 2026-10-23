// The API front for the telemetry collector (same Collector the legacy /telemetry route uses; only exists when TELEMETRY_COLLECTOR=on).
import {getCollector, githubStats} from '../../telemetry/index.js';
import {ApiError} from '../errors.js';
import {ok} from '../response.js';

const collector = () => { const c = getCollector(); if (!c) throw new ApiError(404, 'not_found', 'Not found'); return c; };
export function ping(body, ip) {
  const out = collector().ingest(body, ip);
  if (!out) throw new ApiError(400, 'rejected', 'Rejected');
  return ok(out);
}
export async function summary() { const c = collector(); return {enabled: true, ...c.summary(), github: await githubStats()}; }
