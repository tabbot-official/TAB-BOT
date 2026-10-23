// Pack kit: each command is a table entry {name, description, usage, aliases?, minArgs?, fn(args, text, ctx) => string, tests:[[input, expected]]}.
// Packs register into the normal command registry (see commandHandler.loadCommands). Pure, offline unless web:true. No secrets.
export function defineCommand(category, e) {
  const minArgs = e.minArgs ?? (e.usage && /<[^>]+>/.test(e.usage) ? 1 : 0);
  return {
    name: e.name, category, description: e.description, usage: e.usage || `${e.name} <text>`,
    aliases: e.aliases || [], minArgs, pack: true, web: !!e.web, ownerOnly: !!e.ownerOnly, group: !!e.group, image: !!e.image, tests: e.tests || [], fn: e.fn,
    async run(ctx) {
      const args = ctx.args || [];
      let out;
      if (args.length < minArgs && !e.noUsageGuard) return ctx.reply(`Usage: /${e.usage || e.name}`);
      try { const flat = args.join(' '); const raw = typeof ctx.text === 'string' ? ctx.text.replace(/^\S+[ \t]*/, '').trim() : flat; const text = raw.split(/\s+/).filter(Boolean).join(' ') === flat ? raw : flat; out = await e.fn(args, text, ctx); } catch (err) { out = `Could not run ${e.name}: ${err.message}`; }
      await ctx.reply(String(out).slice(0, 3500));
    },
  };
}
export const section = (category, entries) => entries.map((e) => defineCommand(category, e));
// Tiny helper: a text transform command with one self-checking example.
export const tx = (name, description, fn, input, expected, extra = {}) => ({ name, description, usage: `${name} <text>`, fn: (a, t) => fn(t, a), tests: [typeof expected === 'function' ? [input, null, expected] : [input, expected]], ...extra });
// Builder for entry tables: string expectations match as "output contains", functions are predicates.
export const builder = (E) => (name, description, usage, fn, tests, minArgs = 0, extra = {}) => E.push({ name, description, usage, minArgs, fn, tests: tests.map(([i, e, f]) => [i, typeof e === 'string' ? null : e, typeof e === 'string' ? (o) => o.includes(e) : f]), ...extra });
