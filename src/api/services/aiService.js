// AI layer: wraps the bot's existing providers (keys stay in env, never in responses). One quota per caller key keeps usage bounded.
import {askAi} from '../../ai/providers.js';
import {geminiTranslate} from '../../ai/providers.js';
import {ApiError, tooMany} from '../errors.js';

const used = new Map(); const LIMIT = Number(process.env.API_AI_PER_HOUR || 30);
function quota(id, now = Date.now()) { const a = (used.get(id) || []).filter((t) => now - t < 3600000); if (a.length >= LIMIT) throw tooMany(Math.ceil((a[0] + 3600000 - now) / 1000)); used.set(id, [...a, now]); if (used.size > 2000) used.clear(); }
const wrap = (e) => { if (e instanceof ApiError) return e; if (e?.code === 'NO_KEYS') return new ApiError(503, 'ai_not_configured', 'No AI provider is configured on this bot'); return new ApiError(502, 'ai_unavailable', 'The AI provider is busy, try again'); };
export async function chat(callerId, prompt) { quota(callerId); try { const r = await askAi(String(prompt)); return {text: r.text, provider: r.provider}; } catch (e) { throw wrap(e); } }
export async function translate(callerId, text, to) { quota(callerId); try { return {text: await geminiTranslate(String(text), String(to)), to}; } catch (e) { throw wrap(e); } }
