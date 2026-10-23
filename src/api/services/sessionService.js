// WhatsApp session view. Today there is one paired session ("primary"). Responses never include credentials, keys or session files.
import crypto from 'node:crypto';
import {emit} from '../events/bus.js';
import {ApiError} from '../errors.js';

const state = {up: false, since: Date.now(), reconnects: 0, everUp: false, changes: 0};
let adapter = {number: () => '', logout: null};
export const setAdapter = (a) => { adapter = {...adapter, ...a}; };
export function recordConnection(up, now = Date.now()) {
  if (up === state.up && state.changes) return;
  if (up && state.everUp) state.reconnects++;
  if (up) state.everUp = true;
  state.up = up; state.since = now; state.changes++;
  emit('connection.changed', {session: 'primary', status: up ? 'online' : 'offline', reconnects: state.reconnects});
}
export const maskNumber = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 6 ? d.slice(0, 2) + '*'.repeat(d.length - 4) + d.slice(-2) : null; };
const sid = () => 's_' + crypto.createHash('sha256').update('primary:' + (process.env.OWNER_NUMBER || 'x')).digest('hex').slice(0, 10);
export function view() {
  return {id: sid(), label: 'Primary WhatsApp session', status: state.up ? 'online' : (state.everUp ? 'reconnecting' : 'offline'), since: new Date(state.since).toISOString(), reconnects: state.reconnects, account: maskNumber(adapter.number())};
}
export const list = () => [view()];
export function get(id) { const v = view(); if (id !== v.id) throw new ApiError(404, 'not_found', 'No such session'); return v; }
/** Logout revokes the paired login: the owner must pair again afterwards. Needs an explicit confirm at the controller. */
export async function revoke(id) {
  get(id); if (!adapter.logout) throw new ApiError(501, 'not_supported', 'Logout is not available in this runtime');
  await adapter.logout(); emit('session.revoked', {session: id}); return {revoked: true};
}
export const pairingCapabilities = () => ({supported: false, mode: 'relay', note: 'The pairing portal is not built yet. When it is, it will call POST /api/v1/pairing/requests and poll GET /api/v1/pairing/requests/{id}. Until then these endpoints return 501.'});
