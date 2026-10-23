// Tiny in-process event bus. Webhooks and SSE (later phases) subscribe here; payloads must never contain credentials.
import {EventEmitter} from 'node:events';
export const bus = new EventEmitter(); bus.setMaxListeners(50);
export const emit = (type, data = {}) => { try { bus.emit('event', {type, at: Date.now(), data}); } catch { /* listeners must not break the bot */ } };
