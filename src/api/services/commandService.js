// Controlled command interface. Listing is read-only. Execution is limited to an allowlist of simple text commands that never need a
// WhatsApp socket or chat, runs through the same switch-off check as chat, has a hard timeout, and can never reach a socket.
import {getRegistry} from './botService.js';
import {commandOn} from '../../auth/features.js';
import {ApiError, notFound, badRequest} from '../errors.js';

export const API_SAFE = new Set(['time', '8ball', 'coinflip', 'dice', 'fact', 'joke', 'quote', 'define', 'timestamp']);
const view = (c) => ({name: c.name, aliases: c.aliases || [], category: c.category || 'General', description: c.description || '', usage: c.usage || c.name, minArgs: c.minArgs || 0, requiredLevel: c.requiredLevel || (c.ownerOnly ? 'owner' : 'user'), enabled: commandOn(c), apiExecutable: API_SAFE.has(c.name)});
const reg = () => { const r = getRegistry(); if (!r?.list) throw new ApiError(503, 'unavailable', 'Command registry not ready'); return r; };
export function list({category} = {}) { const all = reg().list().map(view); return category ? all.filter((c) => c.category.toLowerCase() === String(category).toLowerCase()) : all; }
export function get(name) { const c = reg().get(String(name).toLowerCase()); if (!c) throw notFound('No such command'); return view(c); }
export async function execute(name, args = [], timeoutMs = 10000) {
  const c = reg().get(String(name).toLowerCase()); if (!c) throw notFound('No such command');
  if (!API_SAFE.has(c.name)) throw new ApiError(403, 'not_api_executable', 'This command can only be used from WhatsApp');
  if (!commandOn(c)) throw new ApiError(409, 'command_off', 'This command is switched off by the owner');
  if ((c.minArgs || 0) > args.length) throw badRequest(`Usage: ${c.usage || c.name}`);
  const out = [];
  const deny = () => { throw new ApiError(422, 'needs_whatsapp', 'This command needs a WhatsApp chat'); };
  const ctx = {args, commandName: c.name, isGroup: false, isOwner: false, jid: 'api', sender: 'api', senderJid: 'api', msg: {}, commands: [], reply: async (t) => { out.push(String(t?.text ?? t ?? '')); return {key: {}}; }, sock: new Proxy({}, {get: () => deny})};
  let timer; const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new ApiError(504, 'timeout', 'Command timed out')), timeoutMs); });
  try { await Promise.race([c.run(ctx), timeout]); } finally { clearTimeout(timer); }
  return {command: c.name, output: out.join('\n').slice(0, 4000)};
}
