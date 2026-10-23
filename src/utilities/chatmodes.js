// Per-chat opt-in switches for ambient behaviors: autoreact, autosticker.
// Default OFF everywhere; anyone can turn them on in a group, the owner anywhere.
import path from 'node:path';
import config from '../config/config.js';
import { TinyJson } from '../subs/tinyjson.js';

let store = null;
function st() { if (!store) store = new TinyJson(path.join(config.paths.data, 'chat-modes.json'), {}); return store; }
const key = (jid, mode) => jid + '|' + mode;
export const chatModeOn = (jid, mode) => st().data[key(jid, mode)] === true;
export function setChatMode(jid, mode, on) { st().data[key(jid, mode)] = !!on; st().save(); }
