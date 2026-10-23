export default {name:'timestamp',category:'Utilities',description:'Current Unix time in seconds',usage:'timestamp',async run(ctx){await ctx.reply('Unix seconds: '+Math.floor(Date.now()/1000));}};
