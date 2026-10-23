// "Did you mean" for mistyped commands. Edit distance, tiny and dependency free.
export function distance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** Up to `max` close command names. Owner-only commands are never suggested. */
export function suggest(name, commands, max = 3) {
  const n = String(name || '').toLowerCase();
  if (n.length < 3) return [];
  const limit = n.length <= 3 ? 1 : 2;
  return [...commands]
    .filter((c) => !c.ownerOnly && c.requiredLevel !== 'owner')
    .flatMap((c) => [c.name, ...(c.aliases || [])].map((x) => ({ x, name: c.name, d: n.length > 3 && x.startsWith(n) ? 1 : distance(n, x) })))
    .filter((r) => r.d <= limit)
    .sort((a, b) => a.d - b.d || a.x.length - b.x.length)
    .map((r) => r.name)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, max);
}
