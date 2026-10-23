import {watches} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {priceOf} from '../subs/price.js';
import {who} from '../subs/parse.js';
export default {name:'pricealert',aliases:['palert','price'],category:'Utilities',
 description:'Alert when a crypto coin or stock crosses your target price',
 usage:'pricealert add <btc|eth|RELIANCE.NS|AAPL.US...> <above|below> <price> | pricealert list | pricealert remove <id>',
 async run(ctx){
  if(!featOn('pricealert'))return featReply(ctx,'pricealert');
  const me=who(ctx);const a=(ctx.args[0]||'').toLowerCase();
  const mineList=watches.forRecipient(ctx.jid).filter(j=>j.kind==='price'&&j.owner===me);
  if(a==='list'){return ctx.reply(mineList.length?'🔔 Your price alerts:\n'+mineList.map(j=>j.id+': '+j.asset.toUpperCase()+' '+j.dir+' '+j.target).join('\n'):'No alerts. Add: /pricealert add btc above 150000');}
  if(a==='remove'||a==='delete'){const id=ctx.args[1];if(!id)return ctx.reply('Usage: /pricealert remove <id>');return ctx.reply(watches.cancel(id,ctx.jid)?'✅ Alert removed.':'No alert of yours with that id.');}
  if(a==='add'){
   const [,asset,dir,targetS]=ctx.args;
   if(!asset||!/^(above|below)$/i.test(dir||'')||!Number.isFinite(Number(targetS)))return ctx.reply('Usage: /pricealert add <asset> <above|below> <price>\nCrypto: btc, eth, sol, doge, bnb, xrp, ada (target in ₹)\nStocks: RELIANCE.NS, TCS.NS, AAPL.US (target in its currency)');
   if(mineList.length>=5)return ctx.reply('Max 5 active alerts per person.');
   let q;try{q=await priceOf(asset);}catch(e){return ctx.reply('Could not fetch a live price for "'+asset.slice(0,20)+'". Check the symbol and retry.');}
   const target=Number(targetS);
   try{watches.add({kind:'price',recipient:ctx.jid,owner:me,asset:asset.toLowerCase(),dir:dir.toLowerCase(),target,every:5*60000});}catch(e){return ctx.reply('Too many watches on the bot right now. Try later.');}
   const cur=q.inr!=null?{v:q.inr,sym:'₹'}:{v:q.price,sym:q.currency==='INR'?'₹':'$'};
   return ctx.reply('✅ Alert set: '+asset.toUpperCase()+' '+dir.toLowerCase()+' '+cur.sym+target+' (now '+cur.sym+cur.v+'). Checked every 5 min in this chat.\nList: /pricealert list');
  }
  // bare /pricealert btc = quick price check
  if(a&&a!=='add'&&ctx.args.length===1){
   try{const q=await priceOf(a);const cur=q.inr!=null?'₹'+q.inr+' ($'+q.usd+')':(q.currency==='INR'?'₹':'$')+q.price;return ctx.reply('💹 '+q.name+': '+cur);}catch{return ctx.reply('Unknown symbol. Try /pricealert add btc above 150000');}
  }
  return ctx.reply('Usage: /pricealert add <asset> <above|below> <price> | /pricealert list | /pricealert remove <id>');
 }};
