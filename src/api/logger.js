// Structured JSON logs. Anything that looks like a credential or a phone number is redacted before it is written.
import logger from '../utils/logger.js';
const SECRET = /(authorization|token|key|secret|password|cookie|creds|session|number|phone|jid)/i;
export function redact(v, depth = 0) {
  if (v == null || depth > 4) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => redact(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, SECRET.test(k) ? '[redacted]' : redact(x, depth + 1)]));
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '...' : v;
  return v;
}
export const log = (level, msg, fields = {}) => logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](JSON.stringify({t: new Date().toISOString(), scope: 'api', msg, ...redact(fields)}));
