export default {
  name: 'ping',
  aliases: ['alive'], // Tab: common bot command; ".alive" was unknown
  category: 'General',
  description: 'Check that the bot is alive and how fast it replies',
  usage: 'ping',
  async run(ctx) {
    const started = Date.now();
    const sent = await ctx.reply('🏓' );
    const ms = Date.now() - started;
    await ctx.sock.sendMessage(ctx.jid, { text: `🏓 ${ms} ms`, edit: sent.key }).catch(() => {});
  },
};
