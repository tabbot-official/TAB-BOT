// Helper for content-pool commands: random pick from a list, optional {name} substitution.
import { builder } from './_kit.js';
export const rnd = (list, r = Math.random) => list[Math.floor(r() * list.length)];
export const poolMaker = (E) => {
  const b = builder(E);
  // pool(name, description, items, {withName, prefix})
  return (name, description, items, o = {}) => {
    const list = items.split('|').map((x) => x.trim()).filter(Boolean);
    b(name, description, `${name}${o.withName ? ' [name]' : ''}`, (a, t) => { const who = (t || '').slice(0, 60).replace(/[\r\n]+/g, ' ') || 'you'; const s = rnd(list); return (o.prefix || '') + s.replace(/\{name\}/g, who); }, [[o.withName ? 'Sam' : '', null, (out) => { const p = o.prefix || ''; return out.startsWith(p) && list.some((s) => out === p + s.replace(/\{name\}/g, o.withName ? 'Sam' : 'you')); }]], 0);
  };
};
// builder that accepts [input, predicateFn] as well as [input, 'contains'] tests.
export const mk = (E) => { const _b = builder(E); return (n, d, u, fn, tests, min) => _b(n, d, u, fn, tests.map((t) => (typeof t[1] === 'function' ? [t[0], null, t[1]] : t)), min); };
