// Tiny persisted on/off switches for owner-toggled behaviors (anticall, autobio, ...).
// Default OFF for account-behavior features: they change how the account acts on
// WhatsApp, so Rohan turns them on explicitly.
import path from 'node:path';
import config from '../config/config.js';
import { TinyJson } from '../subs/tinyjson.js';

let store = null;
function st() { if (!store) store = new TinyJson(path.join(config.paths.data, 'feature-toggles.json'), {}); return store; }
export const isOn = (name) => st().data[name] === true;
export function set(name, on) { st().data[name] = !!on; st().save(); }
