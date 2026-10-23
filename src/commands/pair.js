import config from '../config/config.js';
import {bridge, loadSaved, mintCode} from '../ecosystem/pairing.js';

export default {
  name: 'pair', aliases: ['portalpair'], category: 'System',
  description: 'Pair this bot with the Tab pairing website using the code it shows', usage: 'pair K7QM-4X2P  |  pair 919876543210 (maintainer: make a code for someone)', minArgs: 0,
  async run(ctx) {
    if (!ctx.isOwner) return ctx.reply('Only the owner of this bot can pair it.');
    const arg = String(ctx.args?.[0] || ''), digits = arg.replace(/\D/g, '');
    if (digits.length >= 10 && /^\+?[\d\s-]+$/.test(arg)) { // owner makes a code for ANOTHER number (maintainer bot only)
      const m = await mintCode({number: digits});
      return ctx.reply(m.ok ? `Pairing code for ${digits.slice(0, 3)}...${digits.slice(-2)}: ${m.short}\nValid ${m.minutes} minutes, works once. They send "/pair ${m.short}" to their own Tab.` : 'Not made: ' + m.why);
    }
    if (loadSaved(config.paths.data)) return ctx.reply('This bot is already paired. Type /sid to see your S-ID.');
    const code = arg;
    if (!code) return ctx.reply('Open the pairing website, enter your number, then send the code it shows here.\nExample: /pair K7QM-4X2P');
    if (!bridge.start) return ctx.reply('Pairing is not available on this install.');
    const r = await bridge.start(code, config.ownerNumber);
    await ctx.reply(r.ok ? 'Code accepted. Verifying, your S-ID will arrive in your own chat in a few seconds.' : 'Not paired: ' + r.why);
  },
};
