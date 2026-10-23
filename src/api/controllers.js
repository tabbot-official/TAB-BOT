import {ok} from './response.js';
import {badRequest, forbidden, ApiError} from './errors.js';
import {sign} from './services/jwt.js';
import {createKey, listKeys, revokeKey, findKey, ROLES, hasRole} from './services/keys.js';
import * as bot from './services/botService.js';
import {emit} from './events/bus.js';
import {log} from './logger.js';
import * as sessions from './services/sessionService.js';
import * as hooks from './services/webhooks.js';
import * as cmds from './services/commandService.js';
import * as plugins from './services/pluginService.js';
import * as ai from './services/aiService.js';
import {sendPortalOtp} from './services/otpService.js';
import * as tele from './services/telemetryService.js';

export const health = () => ok({status: 'ok', time: new Date().toISOString()});
export const botStatus = () => ok(bot.status());
export const botRuntime = async () => ok(await bot.runtime());
export function botRestart({body, caller}) {
  if (body.confirm !== true) throw badRequest('Send {"confirm": true} to restart');
  log('warn', 'bot restart requested', {by: caller.id}); emit('bot.restart', {by: caller.id}); bot.scheduleRestart();
  return ok({restarting: true}, 202);
}
export function issueToken({body, headers}) {
  const k = findKey(String(headers['x-api-key'] || body.apiKey || ''));
  if (!k) throw forbidden('Invalid API key');
  return ok({token: sign({sub: k.id, role: k.role}, 900), tokenType: 'Bearer', expiresIn: 900, role: k.role});
}
export const whoami = ({caller}) => ok({id: caller.id, role: caller.role, via: caller.via});
export const keysList = () => ok({keys: listKeys(), roles: ROLES});
export function keysCreate({body, caller}) {
  if (body.role && !hasRole(caller.role, body.role)) throw forbidden('Cannot create a key above your own role');
  const k = createKey(body.name, body.role || 'readonly'); log('warn', 'api key created', {by: caller.id, id: k.id, role: k.role});
  return ok({id: k.id, role: k.role, apiKey: k.key, note: 'Store this key now. It is never shown again.'}, 201);
}
export function keysRevoke({params, caller}) {
  if (!revokeKey(params.id)) throw badRequest('No such key'); log('warn', 'api key revoked', {by: caller.id, id: params.id}); return ok({revoked: true});
}

export const sessionsList = () => ok({sessions: sessions.list()});
export const sessionGet = ({params}) => ok(sessions.get(params.id));
export async function sessionRevoke({params, body, caller}) {
  if (body.confirm !== true) throw badRequest('Send {"confirm": true}. This logs the WhatsApp session out and it must be paired again.');
  log('warn', 'session revoke requested', {by: caller.id, id: params.id}); return ok(await sessions.revoke(params.id), 202);
}
export const pairingCaps = () => ok(sessions.pairingCapabilities());
export function pairingNotReady() { throw new ApiError(501, 'not_implemented', 'The pairing portal is not available yet'); }
export const eventTypes = () => ok({events: hooks.EVENT_TYPES});
export const hooksList = () => ok({webhooks: hooks.list()});
export async function hooksCreate({body, caller}) {
  const w = await hooks.create(body); log('warn', 'webhook created', {by: caller.id, id: w.id});
  return ok({id: w.id, url: w.url, events: w.events, secret: w.secret, note: 'Store the secret now. Verify deliveries with HMAC-SHA256 of "<x-jarvis-timestamp>.<raw body>".'}, 201);
}
export function hooksDelete({params, caller}) { if (!hooks.remove(params.id)) throw badRequest('No such webhook'); log('warn', 'webhook deleted', {by: caller.id, id: params.id}); return ok({deleted: true}); }
export function hooksTest({params}) {
  const w = hooks.list().find((x) => x.id === params.id); if (!w) throw badRequest('No such webhook');
  emit('webhook.test', {webhook: w.id}); return ok({queued: true}, 202);
}

export const commandsList = ({query}) => ok({commands: cmds.list({category: query.category})});
export const commandGet = ({params}) => ok(cmds.get(params.name));
export async function commandExecute({params, body, caller}) {
  const args = Array.isArray(body.args) ? body.args.map((a) => String(a).slice(0, 200)).slice(0, 10) : [];
  log('info', 'command execute', {by: caller.id, command: params.name}); return ok(await cmds.execute(params.name, args));
}
export const pluginsList = () => ok({plugins: plugins.list()});
export const pluginsSet = (on) => ({params, caller}) => { log('warn', 'plugin switch', {by: caller.id, name: params.name, enabled: on}); return ok(plugins.setEnabled(params.name, on)); };
export async function aiChat({body, caller}) { return ok(await ai.chat(caller.id, body.prompt)); }
export async function aiTranslate({body, caller}) { return ok(await ai.translate(caller.id, body.text, body.to)); }

export async function telemetryPing({body, headers, ip}) {
  const fwd = process.env.API_TRUST_PROXY === 'on' ? String(headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return tele.ping(body, fwd || ip);
}
export async function telemetrySummary() { return ok(await tele.summary()); }

export async function portalOtp({body}) {
  const r = await sendPortalOtp(String(body.number), body.code === undefined ? '' : String(body.code), Date.now(), body.sid === undefined ? '' : String(body.sid));
  if (r.why === 'invalid') throw badRequest('Send number plus exactly one of code or sid');
  if (r.why === 'rate') throw new ApiError(429, 'rate_limited', 'Wait before sending another code to this number');
  if (!r.sent) throw new ApiError(503, 'send_failed', 'WhatsApp is offline or the send failed');
  return ok({sent: true});
}
