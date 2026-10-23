// Outgoing group actions go through one slow queue so the bot never bursts (WhatsApp ban risk).
import logger from '../utils/logger.js';

let Bottleneck = null;
try { Bottleneck = (await import('bottleneck')).default; } catch { logger.info('[groups] bottleneck not installed, using built-in queue'); }

class SimpleLimiter {
  constructor(minTime) { this.minTime = minTime; this.chain = Promise.resolve(); }
  schedule(fn) {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, this.minTime)));
    return run;
  }
}

// One message/action per 1.2 s, never more than 2 at the same time.
export const out = Bottleneck ? new Bottleneck({ minTime: 1200, maxConcurrent: 1 }) : new SimpleLimiter(1200);
// Heavier admin actions (add/remove/promote) are spaced further apart.
export const admin = Bottleneck ? new Bottleneck({ minTime: 2500, maxConcurrent: 1 }) : new SimpleLimiter(2500);

/** Per-user command rate limit: at most `max` commands per `windowMs`. */
const hits = new Map();
export function rateLimited(key, max = 8, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

/** Simple cooldown: returns remaining ms (0 when free) and starts the cooldown. */
const cool = new Map();
export function cooldown(key, ms) {
  const now = Date.now();
  const until = cool.get(key) || 0;
  if (until > now) return until - now;
  cool.set(key, now + ms);
  if (cool.size > 5000) cool.clear();
  return 0;
}
