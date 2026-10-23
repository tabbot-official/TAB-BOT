import {findStock,formatStock,goldPrices,formatGold} from '../fun/stock.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(8);
export default {name:'stock',aliases:['share','stockprice','gold'],category:'Utilities',description:'Share price (NSE/BSE/US) and gold/silver rates',usage:'stock reliance | stock AAPL | stock gold',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 8 lookups per minute.');
  const q=(ctx.args||[]).join(' ').trim();
  try{
   if(ctx.commandName==='gold'||/^(gold|silver|sona|chandi)$/i.test(q))return await ctx.reply(formatGold(await goldPrices()));
   if(!q)return await ctx.reply('Send a company name or symbol. Examples: stock reliance, stock TCS, stock AAPL. Gold rates: stock gold');
   const s=await findStock(q);
   return await ctx.reply(s?formatStock(s):'No stock found for "'+q.slice(0,40)+'". Try the company name or ticker.');
  }catch{return ctx.reply('Market data is not available right now. Try again in a minute.');}
 }};
