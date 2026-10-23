// MORSE: text <-> morse code. Pure mapping, no network.
import { featOn } from '../config/features.js';

const T = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', "'": '.----.', '"': '.-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '/': '-..-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '$': '...-..-', '@': '.--.-.' };
const F = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

export default {
  name: 'morse', aliases: ['morsecode'], category: 'Tools',
  description: 'Encode text to Morse code or decode it back',
  usage: 'morse <text> | morse <morse code>',
  async run(ctx) {
    if (!featOn('morse')) return ctx.reply('Morse is turned off right now.');
    let input = ctx.args.join(' ').trim();
    let force = null;
    const first = (ctx.args[0] || '').toLowerCase();
    if (['encode', 'decode'].includes(first)) { force = first; input = ctx.args.slice(1).join(' ').trim(); }
    if (!input) return ctx.reply('Give me text to encode, or Morse (dots and dashes) to decode. Use /morse decode <code> to force decoding.');
    if (input.length > 500) return ctx.reply('Keep it under 500 characters.');
    if (force === 'decode' || (force !== 'encode' && /^[.\-/\\ |]+$/.test(input) && /[.-]/.test(input))) {
      const words = input.replace(/\\/g, '/').split('/').map((w) => w.trim().split(/\s+/).map((c) => F[c] || '�').join(''));
      return ctx.reply('📡 Decoded: ' + words.join(' '));
    }
    const enc = [...input.toLowerCase()].map((c) => c === ' ' ? '/' : (T[c] || '')).filter(Boolean).join(' ');
    if (!enc) return ctx.reply('Nothing I can encode in that text.');
    return ctx.reply('📡 ' + enc);
  },
};
