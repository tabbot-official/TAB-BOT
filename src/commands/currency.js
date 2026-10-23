import {parseConvert,convert,formatConvert} from '../fun/currency.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(8);
export default {name:'currency',aliases:['fx','forex','crypto'],category:'Utilities',description:'Convert currencies and major crypto',usage:'currency 100 usd inr  |  currency 1 btc usd',minArgs:1,
 async run(ctx){
  const p=parseConvert(ctx.args);
  if(!p)return ctx.reply('Format: currency 100 usd inr\nCrypto works too: currency 1 btc usd (btc, eth, sol, doge, xrp, bnb, usdt...)');
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 8 conversions per minute.');
  let r;try{r=await convert(p);}catch{return ctx.reply('Rate service is busy. Try again in a minute.');}
  if(!r)return ctx.reply('Unknown currency code. Use codes like USD, INR, EUR, GBP, AED, or crypto like BTC, ETH.');
  return ctx.reply(formatConvert(r));
 }};
