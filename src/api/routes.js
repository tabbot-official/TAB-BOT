import {Router} from './router.js';
import * as c from './controllers.js';
import {ROLES} from './services/keys.js';

export const PREFIX = '/api/v1';
export function buildRouter() {
  const r = new Router(); const add = (m, p, o) => r.add({method: m, path: PREFIX + p, ...o});
  add('GET', '/health', {tag: 'System', summary: 'Liveness check (no auth)', auth: null, rate: 30, handler: c.health});
  add('POST', '/auth/token', {tag: 'Auth', summary: 'Exchange an API key (X-API-Key header) for a 15 minute JWT', auth: null, rate: 10, body: {}, handler: c.issueToken});
  add('GET', '/auth/me', {tag: 'Auth', summary: 'Who am I (id and role)', auth: 'readonly', handler: c.whoami});
  add('GET', '/bot/status', {tag: 'Bot', summary: 'Online state, connection, version, uptime', auth: 'readonly', handler: c.botStatus});
  add('GET', '/bot/runtime', {tag: 'Bot', summary: 'RAM, CPU, disk and command counters', auth: 'service', handler: c.botRuntime});
  add('POST', '/bot/restart', {tag: 'Bot', summary: 'Restart the bot process (owner only, needs confirm:true)', auth: 'owner', body: {confirm: {type: 'boolean', required: true}}, handler: c.botRestart});
  add('GET', '/keys', {tag: 'Keys', summary: 'List API keys (never the secrets)', auth: 'admin', handler: c.keysList});
  add('POST', '/keys', {tag: 'Keys', summary: 'Create an API key; the key is shown once', auth: 'admin', body: {name: {type: 'string', required: true, max: 40}, role: {type: 'string', enum: ROLES}}, handler: c.keysCreate});
  add('DELETE', '/keys/:id', {tag: 'Keys', summary: 'Revoke an API key', auth: 'admin', handler: c.keysRevoke});
  add('GET', '/sessions', {tag: 'Sessions', summary: 'List WhatsApp sessions (status only, never credentials)', auth: 'service', handler: c.sessionsList});
  add('GET', '/sessions/:id', {tag: 'Sessions', summary: 'One session: status, uptime since, reconnect count, masked account', auth: 'service', handler: c.sessionGet});
  add('DELETE', '/sessions/:id', {tag: 'Sessions', summary: 'Log the session out (owner, needs confirm:true; re-pairing required)', auth: 'owner', body: {confirm: {type: 'boolean', required: true}}, handler: c.sessionRevoke});
  add('GET', '/pairing/capabilities', {tag: 'Pairing', summary: 'What the pairing flow supports today', auth: 'service', handler: c.pairingCaps});
  add('POST', '/pairing/requests', {tag: 'Pairing', summary: 'Reserved for the future pairing portal (returns 501 now)', auth: 'admin', body: {number: {type: 'string', required: true, max: 20, pattern: /^\+?\d{7,15}$/}}, handler: c.pairingNotReady});
  add('POST', '/portal/otp', {tag: 'Pairing', summary: 'Send a 6-digit portal code or an S-ID to a WhatsApp number (fixed wording, service key)', auth: 'service', rate: 20, body: {number: {type: 'string', required: true, max: 15, pattern: /^[1-9]\d{9,14}$/}, code: {type: 'string', max: 6, pattern: /^\d{6}$/}, sid: {type: 'string', max: 8, pattern: /^S-[A-Z0-9]{6}$/}}, handler: c.portalOtp});
  add('GET', '/events/types', {tag: 'Events', summary: 'Event types that webhooks can subscribe to', auth: 'readonly', handler: c.eventTypes});
  add('GET', '/webhooks', {tag: 'Webhooks', summary: 'List webhooks (never the secrets)', auth: 'admin', handler: c.hooksList});
  add('POST', '/webhooks', {tag: 'Webhooks', summary: 'Create a webhook (https only); the signing secret is shown once', auth: 'admin', body: {url: {type: 'string', required: true, max: 300}, events: {type: 'object'}}, handler: c.hooksCreate});
  add('DELETE', '/webhooks/:id', {tag: 'Webhooks', summary: 'Delete a webhook', auth: 'admin', handler: c.hooksDelete});
  add('POST', '/webhooks/:id/test', {tag: 'Webhooks', summary: 'Send a signed webhook.test event', auth: 'admin', body: {}, handler: c.hooksTest});
  add('GET', '/commands', {tag: 'Commands', summary: 'List commands (optional ?category=). Read-only metadata', auth: 'readonly', handler: c.commandsList});
  add('GET', '/commands/:name', {tag: 'Commands', summary: 'One command: usage, level, enabled, whether the API can run it', auth: 'readonly', handler: c.commandGet});
  add('POST', '/commands/:name/execute', {tag: 'Commands', summary: 'Run an API-safe text command (allowlist only; never reaches a chat or socket)', auth: 'service', rate: 20, body: {args: {type: 'object'}}, handler: c.commandExecute});
  add('GET', '/plugins', {tag: 'Plugins', summary: 'Feature groups with on/off state and command counts', auth: 'readonly', handler: c.pluginsList});
  add('POST', '/plugins/:name/enable', {tag: 'Plugins', summary: 'Switch a feature group on', auth: 'admin', body: {}, handler: c.pluginsSet(true)});
  add('POST', '/plugins/:name/disable', {tag: 'Plugins', summary: 'Switch a feature group off', auth: 'admin', body: {}, handler: c.pluginsSet(false)});
  add('POST', '/ai/chat', {tag: 'AI', summary: 'Ask the bot AI (30 per hour per key)', auth: 'service', rate: 20, body: {prompt: {type: 'string', required: true, max: 2000}}, handler: c.aiChat});
  add('POST', '/ai/translate', {tag: 'AI', summary: 'Translate text (30 per hour per key, shared with chat)', auth: 'service', rate: 20, body: {text: {type: 'string', required: true, max: 2000}, to: {type: 'string', required: true, max: 30}}, handler: c.aiTranslate});
  add('POST', '/telemetry/ping', {tag: 'Telemetry', summary: 'Public install ping (only when this deployment is the collector; strict schema, hashed id, command counts, no chats or numbers)', auth: null, rate: 60, raw: true, handler: c.telemetryPing});
  add('GET', '/telemetry/summary', {tag: 'Telemetry', summary: 'Install totals, versions, top commands and the SID list (collector only)', auth: 'service', handler: c.telemetrySummary});
  return r;
}
