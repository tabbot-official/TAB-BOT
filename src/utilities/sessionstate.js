// Session resilience: a small on-disk state file (data/session-state.json) that
// survives crashes, so outside monitors can see exactly what the session is doing.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';

const file = () => path.join(config.paths.data, 'session-state.json');
export function writeState(state, extra = {}) {
  try {
    fs.mkdirSync(config.paths.data, { recursive: true });
    fs.writeFileSync(file() + '.tmp', JSON.stringify({ state, at: new Date().toISOString(), ...extra }));
    fs.renameSync(file() + '.tmp', file());
  } catch { /* best effort */ }
}
export function readState() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } }
