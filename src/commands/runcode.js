// RUNCODE: run small code snippets in the free Piston sandbox (emkc.org). No local execution.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const LANGS = { js: 'javascript', javascript: 'javascript', py: 'python', python: 'python', cpp: 'c++', 'c++': 'c++', c: 'c', java: 'java', go: 'go', rust: 'rust', php: 'php', ruby: 'ruby', rb: 'ruby', bash: 'bash', sh: 'bash', ts: 'typescript', csharp: 'c#', 'c#': 'c#' };
let runtimes = null;

async function pickVersion(lang) {
  if (!runtimes) {
    const r = await fetch('https://emkc.org/api/v2/piston/runtimes', { signal: AbortSignal.timeout(15000) });
    runtimes = await r.json();
    setTimeout(() => { runtimes = null; }, 3600e3).unref?.();
  }
  const rt = runtimes.find((x) => x.language === lang) || runtimes.find((x) => (x.aliases || []).includes(lang));
  return rt?.version;
}

export default {
  name: 'runcode', aliases: ['run', 'exec2'], category: 'Tools',
  description: 'Run a small code snippet in a safe online sandbox',
  usage: 'runcode <language> <code>',
  async run(ctx) {
    if (!featOn('runcode')) return ctx.reply('Code running is turned off right now.');
    const lang = LANGS[(ctx.args[0] || '').toLowerCase()];
    const code = ctx.args.slice(1).join(' ').trim();
    if (!lang || !code) return ctx.reply('Use: ' + config.prefix + 'runcode <language> <code>\nLanguages: ' + [...new Set(Object.values(LANGS))].join(', '));
    if (code.length > 4000) return ctx.reply('Keep snippets under 4000 characters.');
    try {
      const version = await pickVersion(lang);
      if (!version) return ctx.reply('That language is not available on the sandbox right now.');
      const r = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, version, files: [{ content: code }], run_timeout: 8000, compile_timeout: 10000 }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await r.json();
      const out = (j.run?.output || j.compile?.output || '(no output)').slice(0, 1500);
      return ctx.reply('```\n' + out + '\n```' + (j.run?.code ? '\n(exit ' + j.run.code + ')' : ''));
    } catch (e) {
      logger.warn('[runcode] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ The code sandbox is not reachable right now.');
    }
  },
};
