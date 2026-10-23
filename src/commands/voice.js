import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {speakText, voiceLimiter} from '../services/hfMedia.js';

// Language names accepted as the first word. Names must match the model's language list exactly.
export const LANGS = {hindi: 'Hindi', english: 'English', bengali: 'Bengali', tamil: 'Tamil', telugu: 'Telugu', marathi: 'Marathi', gujarati: 'Gujarati', urdu: 'Urdu', punjabi: 'Punjabi', spanish: 'Spanish', french: 'French', german: 'German', arabic: 'Arabic', japanese: 'Japanese'};
export function parseVoiceArgs(args) {
  const a = [...args];
  let lang = 'Auto';
  if (a.length > 1 && LANGS[a[0].toLowerCase()]) lang = LANGS[a.shift().toLowerCase()];
  return {lang, text: a.join(' ').trim()};
}
function toOgg(inp, out) {
  return new Promise((res, rej) => {
    const p = spawn(config.tools?.ffmpeg || 'ffmpeg', ['-nostdin', '-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', out], {stdio: 'ignore'});
    const t = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.on('error', rej); p.on('close', (c) => { clearTimeout(t); c === 0 ? res() : rej(new Error('ffmpeg ' + c)); });
  });
}
const stamps = new Map();
export default {
  name: 'voice', aliases: ['aivoice', 'natural'], category: 'AI',
  description: 'Natural AI voice message (free, language auto-detected or named)',
  usage: 'voice [language] <text>',
  minArgs: 1,
  async run(ctx) {
    if (process.env.VOICE_ENABLED === 'false') return ctx.reply('AI voice is switched off right now. Try ' + config.prefix + 'tts instead.');
    const quotedMsg = ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const {lang, text: typed} = parseVoiceArgs(ctx.args);
    const text = (typed || quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || '').trim();
    if (!text) return ctx.reply('Usage: ' + config.prefix + 'voice [language] <text>\nExample: ' + config.prefix + 'voice hello, how are you?');
    if (text.length > 300) return ctx.reply('Text too long (max 300 characters). For longer text use ' + config.prefix + 'tts.');
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 60000);
    if (mine.length >= 2) return ctx.reply('Limit: 2 voice messages per minute.');
    if (!voiceLimiter.ok()) return ctx.reply('AI voice is busy or turned off right now. Try ' + config.prefix + 'tts instead.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    let dir;
    try {
      await ctx.sock.sendPresenceUpdate?.('recording', ctx.jid).catch(() => {});
      let wav;
      try { wav = await voiceLimiter.run(() => speakText(text, lang)); }
      catch (e) {
        logger.warn('voice failed: ' + (e?.message || 'error'));
        if (e?.quota) return ctx.reply('The free AI voice limit is used up for today. Try ' + config.prefix + 'tts instead.');
        return ctx.reply('Could not make the voice right now (free AI service busy). Try again, or use ' + config.prefix + 'tts.');
      }
      dir = await createJobDir();
      const a = path.join(dir, 'a.wav'), b = path.join(dir, 'a.ogg');
      await fs.writeFile(a, wav); await toOgg(a, b);
      await ctx.sock.sendMessage(ctx.jid, {audio: await fs.readFile(b), mimetype: 'audio/ogg; codecs=opus', ptt: true}, {quoted: ctx.msg});
    } catch (e) { logger.warn('voice error: ' + (e?.message || 'error')); await ctx.reply('Voice failed.'); }
    finally { await removeJobDir(dir); }
  },
};
