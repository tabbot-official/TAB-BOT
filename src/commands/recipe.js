import {findRecipe,formatRecipe} from '../fun/recipe.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(5);
export default {name:'recipe',aliases:['food2','cook','cocktail'],category:'Utilities',description:'Recipe with ingredients and method (food or drinks)',usage:'recipe biryani | recipe drink mojito | recipe (random)',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 recipes per minute.');
  let a=[...(ctx.args||[])];const kind=(ctx.commandName==='cocktail'||/^(drink|cocktail)$/i.test(a[0]||''))?'drink':'food';if(/^(drink|cocktail|food|meal)$/i.test(a[0]||''))a.shift();
  const q=a.join(' ');let r;
  try{r=await findRecipe(q,{kind});}catch{return ctx.reply('Recipe service is busy. Try again in a minute.');}
  if(!r)return ctx.reply('No recipe found for "'+q.slice(0,40)+'". Try a simpler name (the database is mostly English dish names).');
  const text=formatRecipe(r);
  try{if(r.image)return await ctx.sock.sendMessage(ctx.jid,{image:{url:r.image},caption:text},{quoted:ctx.msg});}catch{/* text only */}
  return ctx.reply(text);
 }};
