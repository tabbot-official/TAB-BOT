// Local enforcement of a verified directive. State is one small file next to the install id.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = (dir) => path.join(dir || config.paths.data, 'telemetry-directive.json');
const read = (dir) => { try { return JSON.parse(fs.readFileSync(file(dir), 'utf8')); } catch { return null; } };
export const setDirective = {
  lastSeq: (dir) => Number(read(dir)?.seq) || 0,
  save: (dir, d) => { try { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(file(dir), JSON.stringify({act: d.act, exp: d.exp, seq: d.seq, lim: d.lim || 0})); } catch { /* best effort */ } },
};
/** Current directive or null. 'clear' and expired directives count as none. */
export function activeDirective(dir, now = Date.now()) {
  if (!directivesAllowed()) return null;
  const d = read(dir); if (!d || d.act === 'clear' || !(d.exp > now)) return null; return d;
}
// Tab: remote suspend/limit enforcement from the original maintainer is disabled. It can only be re-enabled on purpose with
// MAINTAINER_DIRECTIVES=on (not recommended). Any directive file left over from an earlier Jarvis install is ignored.
export const directivesAllowed = () => String(process.env.MAINTAINER_DIRECTIVES || 'off').trim().toLowerCase() === 'on';
const hits = new Map();
/** Returns null when allowed, or a short reason string when this command run must be refused. */
export function directiveBlock(cmdName, sender, dir, now = Date.now()) {
  const d = activeDirective(dir, now); if (!d) return null;
  if (d.act === 'suspend') return cmdName === 'sid' ? null : 'suspended';
  if (d.act === 'limit') {
    const a = (hits.get(sender) || []).filter((t) => now - t < 60000); if (a.length >= (d.lim || 6)) { hits.set(sender, a); return 'limited'; }
    hits.set(sender, [...a, now]); if (hits.size > 5000) hits.clear();
  }
  return null;
}
