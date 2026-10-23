import { runDownloadCommand } from './_download.js';

export default {
  name: 'pinterest',
  aliases: ['pin'],
  category: 'Downloaders',
  description: 'Find a Pinterest pin by name, download one from a link, or get a 3-pin album',
  usage: 'pinterest <name or link> | pinterest album <name> (3 pins at once)',
  minArgs: 1,
  async run(ctx) {
    if ((ctx.args[0] || '').toLowerCase() === 'album') {
      const query = ctx.args.slice(1).join(' ').trim();
      if (!query) return ctx.reply('Usage: /pinterest album <name>\nExample: /pinterest album anime wallpaper');
      await ctx.reply('🖼️ Album mode: sending up to 3 fresh pins for "' + query.slice(0, 40) + '"...');
      const subCtx = { ...ctx, args: [query] };
      for (let i = 0; i < 3; i++) {
        try { await runDownloadCommand(subCtx, { expect: 'pinterest', kind: 'video', label: 'pin' }); }
        catch (e) { break; } // runDownloadCommand already replies errors; stop the album on failure
      }
      return;
    }
    await runDownloadCommand(ctx, { expect: 'pinterest', kind: 'video', label: 'pin' });
  },
};
