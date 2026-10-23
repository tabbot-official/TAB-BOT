// Registry of commands Tab generated itself + their private version history
// + the shared command-failure log. Panel-local only; never published.
import fs from 'node:fs';
import path from 'node:path';

const GEN_FILE = path.join('data', 'generated-commands.json');
const HIST_DIR = path.join('data', 'cmd-history');
const FAIL_FILE = path.join('data', 'command-failures.jsonl');

export function loadGenerated() {
  try { return JSON.parse(fs.readFileSync(GEN_FILE, 'utf8')); } catch { return []; }
}
export function saveGenerated(list) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(GEN_FILE, JSON.stringify(list, null, 1)); } catch { /* best effort */ }
}
export function noteGenerated(name, info = {}) {
  const list = loadGenerated();
  const e = list.find((x) => x.name === name);
  const now = Date.now();
  if (e) Object.assign(e, info, { updatedAt: now });
  else list.push({ name, createdAt: now, updatedAt: now, repairs: 0, ...info });
  saveGenerated(list);
}
export function dropGenerated(name) {
  saveGenerated(loadGenerated().filter((x) => x.name !== name));
}
export function getGenerated(name) {
  return loadGenerated().find((x) => x.name === name) || null;
}

/** Archive the current version of a generated command before overwriting. Returns the archive path. */
export function archiveVersion(name) {
  const file = path.join('src', 'commands', name + '.js');
  try {
    if (!fs.existsSync(file)) return null;
    const dir = path.join(HIST_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, stamp + '.js');
    fs.copyFileSync(file, dest);
    return dest;
  } catch { return null; }
}
export function listVersions(name) {
  try {
    return fs.readdirSync(path.join(HIST_DIR, name)).filter((f) => f.endsWith('.js')).sort();
  } catch { return []; }
}
export function versionPath(name, file) {
  const p = path.join(HIST_DIR, name, path.basename(file));
  return fs.existsSync(p) ? p : null;
}

/** Append a command failure (called by the generated-template wrapper and the handler catch). */
export function logFailure(cmd, err) {
  try {
    fs.mkdirSync('data', { recursive: true });
    fs.appendFileSync(FAIL_FILE, JSON.stringify({ ts: Date.now(), cmd: String(cmd).slice(0, 30), err: String(err).slice(0, 300) }) + '\n');
  } catch { /* best effort */ }
}
/** Read failures newer than `since` (epoch ms). */
export function readFailures(since = 0) {
  let lines = [];
  try { lines = fs.readFileSync(FAIL_FILE, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  const out = [];
  for (const l of lines) {
    try { const r = JSON.parse(l); if (r.ts > since) out.push(r); } catch { /* skip bad line */ }
  }
  return out;
}

/** Build a generated command file. The wrapper logs replies that start with
 *  "Error:" into the failure log so the repair watchdog can see handled
 *  failures too (the LLM-written body catches its own exceptions). */
export function buildCommandFile(cmdName, { desc, usage, minArgs = 1, body }) {
  return "import { logFailure } from '../utils/genregistry.js';\n"
    + 'export default {\n'
    + '  name: ' + JSON.stringify(cmdName) + ',\n'
    + '  aliases: [],\n'
    + '  category: \'Tools\',\n'
    + '  description: ' + JSON.stringify(String(desc || cmdName + ' helper').slice(0, 90)) + ',\n'
    + '  usage: ' + JSON.stringify(cmdName + ' ' + (usage || '<input>')) + ',\n'
    + '  minArgs: ' + minArgs + ',\n'
    + '  async run(ctx) {\n'
    + '    const __ctx = { ...ctx, reply: async (t, o) => { if (/^error:/i.test(String(t).trim())) logFailure(' + JSON.stringify(cmdName) + ', String(t).slice(0, 300)); return ctx.reply(t, o); } };\n'
    + '    const __run = async (ctx) => {\n' + body + '\n    };\n'
    + '    await __run(__ctx);\n'
    + '  },\n'
    + '};\n';
}
