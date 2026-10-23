import {splits} from '../ops/index.js';
import {featOn,featReply} from '../config/features.js';
import {who} from '../subs/parse.js';
const tag=u=>'@'+u;
export default {name:'split',aliases:['splits','expenses'],category:'Group',
 description:'Split group expenses and see who owes whom',
 usage:'split add <amount> <note> [@people] | split balances | split settle | split join | split history | split undo <id> | split reset',minArgs:1,
 async run(ctx){
  if(!featOn('split'))return featReply(ctx,'split');
  const [a,...rest]=ctx.args;const act=a.toLowerCase();const me=who(ctx);const jid=ctx.jid;
  if(act==='join'){splits.join(jid,me);return ctx.reply('✅ You joined the split pool for this chat.');}
  if(act==='leave'){splits.leave(jid,me);return ctx.reply('You left the split pool. Past expenses still count.');}
  if(act==='add'){
   const amount=Number(rest[0]);
   if(!Number.isFinite(amount)||amount<=0||amount>1000000)return ctx.reply('Usage: /split add <amount> <note> [@people]\nExample: /split add 600 dinner @friend1 @friend2');
   const note=rest.slice(1).join(' ').replace(/@\d+/g,'').trim()||'expense';
   const mentions=(ctx.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid||[]).map(j=>String(j).split('@')[0].split(':')[0]);
   const people=[...new Set([me,...mentions])];
   const e=splits.addExpense(jid,me,amount,note,people);
   const share=Math.round(amount/people.length*100)/100;
   return ctx.reply('✅ Added: ₹'+amount+' for "'+note+'" - split between '+people.length+' people (₹'+share+' each).\nBalances: /split balances');
  }
  if(act==='balances'||act==='bal'){
   const net=splits.balances(jid);const rows=Object.entries(net).filter(([,v])=>Math.abs(v)>=0.01);
   if(!rows.length)return ctx.reply('No expenses yet. Add one: /split add 600 dinner');
   return ctx.reply('💰 *Split balances*\n'+rows.map(([u,v])=>tag(u)+': '+(v>0?'+₹'+v.toFixed(0)+' (gets back)':'-₹'+(-v).toFixed(0)+' (owes)')).join('\n')+'\n\nSettle plan: /split settle',);
  }
  if(act==='settle'){
   const plan=splits.settle(jid);
   if(!plan.length)return ctx.reply('All settled up. Nothing to pay.');
   return ctx.reply('🤝 *Settle-up plan*\n'+plan.map(p=>tag(p.from)+' pays '+tag(p.to)+' ₹'+p.amount).join('\n')+'\n\nAfter paying in real life: /split reset');
  }
  if(act==='history'){const g=splits.g(jid);if(!g.expenses.length)return ctx.reply('No expenses yet.');return ctx.reply('🧾 Last expenses:\n'+g.expenses.slice(-10).map(e=>e.id+': ₹'+e.amount+' '+e.note+' (by '+tag(e.payer)+')').join('\n'));}
  if(act==='undo'){const id=rest[0];if(!id)return ctx.reply('Usage: /split undo <id> (see /split history)');return ctx.reply(splits.removeExpense(jid,id)?'🗑️ Expense removed.':'No expense with that id.');}
  if(act==='reset'){splits.reset(jid);return ctx.reply('🔄 Split cleared for this chat. Start fresh with /split add.');}
  return ctx.reply('Usage: /split add <amount> <note> [@people] | /split balances | /split settle | /split history | /split undo <id> | /split reset');
 }};
