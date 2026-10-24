// Loading generated commands (item 8). A generated command file (the /agent
// wrapper shape) is checked by the structural gate and then turned into a
// command object whose run() executes the AI-written body in the sandbox
// (src/utils/sandbox.js) - the module itself is never imported into the bot.
// Exception: bodies that are byte-identical to a pre-tested built-in template
// (src/utils/templates.js, shipped with the bot) run in-process as before,
// because they are repo code, not AI output (and some need multi-turn sessions).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateGeneratedSource, validateGeneratedLoose } from './genstruct.js';
import { runGeneratedCommand } from './sandbox.js';
import { logFailure } from './genregistry.js';
import { TEMPLATES } from './templates.js';

export const GENERATED_PREFIX = "import { logFailure } from '../utils/genregistry.js';";

export function isTemplateBody(name, body) {
  return Object.values(TEMPLATES).some((t) => t && typeof t.body === 'string' && t.body.replaceAll('CMDNAME', name) === body);
}

/** Command object for a gated generated file; run() goes through the sandbox. */
export function sandboxedCommand(meta, body, { run = runGeneratedCommand } = {}) {
  const name = String(meta.name);
  return {
    name,
    aliases: Array.isArray(meta.aliases) ? meta.aliases.map(String) : [],
    category: String(meta.category || 'Tools'),
    description: String(meta.description || ''),
    usage: String(meta.usage || name),
    minArgs: Number(meta.minArgs) || 0,
    sandboxed: true,
    async run(ctx) {
      const reply = async (t, o) => { if (/^error:/i.test(String(t).trim())) logFailure(name, String(t).slice(0, 300)); return ctx.reply(t, o); };
      await run(name, body, { ...ctx, reply });
    },
  };
}

/**
 * Build the command object for a generated command file's source.
 * Wrapper-shaped files: exact structural gate, then sandbox (or in-process for
 * an exact built-in template body). Other registry files (hand-published
 * owner wrappers): the relaxed "declarations only" gate, then a normal import.
 * Throws when a gate fails (caller quarantines).
 */
export async function generatedCommandFromSource(code, file, { bust = false } = {}) {
  const url = pathToFileURL(file).href + (bust ? '?t=' + Date.now() : '');
  if (code.startsWith(GENERATED_PREFIX)) {
    const v = validateGeneratedSource(code);
    if (!v.ok) throw Object.assign(new Error('structural gate failed (' + v.why + ')'), { gate: true });
    if (isTemplateBody(v.meta.name, v.body)) return (await import(url)).default;
    return sandboxedCommand(v.meta, v.body);
  }
  const v = validateGeneratedLoose(code);
  if (!v.ok) throw Object.assign(new Error('structural gate failed (' + v.why + ')'), { gate: true });
  return (await import(url)).default;
}

export async function loadGeneratedFile(file, opts = {}) {
  return generatedCommandFromSource(fs.readFileSync(file, 'utf8'), file, opts);
}
