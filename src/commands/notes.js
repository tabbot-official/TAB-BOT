import {addNote,getNote,listNotes,delNote,allNotes,searchNotes,LIMITS} from '../fun/notes.js';
import {notesPins} from '../ops/index.js';
const HELP='📝 *Notes* (private to you)\n• notes add <name> <text>\n• notes <name>\n• notes list\n• notes search <word>\n• notes pin <name> / unpin\n• notes export (get all notes as a file)\n• notes del <name>\nTip: use it in a private chat so others do not see your notes.';
export default {name:'notes',aliases:['note','memo'],category:'Utilities',description:'Save, pin, search and export your personal notes',usage:'notes add <name> <text> | notes <name> | notes list | notes search <word> | notes pin <name> | notes export | notes del <name>',
 async run(ctx){
  const u=String(ctx.sender),a=ctx.args||[],sub=(a[0]||'').toLowerCase();
  if(!a.length)return ctx.reply(HELP);
  if(sub==='list'){const l=listNotes(u);const pin=notesPins.data[u];const sorted=pin&&l.includes(pin)?[pin,...l.filter(x=>x!==pin)]:l;return ctx.reply(l.length?'📝 Your notes ('+l.length+'):\n'+sorted.map(x=>'• '+(x===pin?'📌 ':'')+x).join('\n'):'You have no notes yet. Add one: notes add shopping milk, eggs');}
  if(sub==='search'||sub==='find'){
   if(!a[1])return ctx.reply('Format: notes search <word>');
   const r=searchNotes(u,a.slice(1).join(' '));
   return ctx.reply(r.length?'🔎 Found '+r.length+':\n'+r.slice(0,10).map(([k,v])=>'• *'+k+'*: '+v.slice(0,80)).join('\n'):'No note matches "'+a.slice(1).join(' ').slice(0,40)+'".');
  }
  if(sub==='pin'){
   if(!a[1])return ctx.reply('Format: notes pin <name>');
   if(getNote(u,a[1])===null)return ctx.reply('No note named "'+a[1].slice(0,LIMITS.name)+'".');
   notesPins.data[u]=a[1].toLowerCase().slice(0,LIMITS.name);notesPins.save();
   return ctx.reply('📌 Pinned "'+a[1].slice(0,LIMITS.name)+'" - it stays on top of notes list.');
  }
  if(sub==='unpin'){delete notesPins.data[u];notesPins.save();return ctx.reply('Pin removed.');}
  if(sub==='export'){
   const all=allNotes(u);const names=Object.keys(all);
   if(!names.length)return ctx.reply('You have no notes to export.');
   const body=names.map(k=>'### '+k+'\n'+all[k].text).join('\n\n');
   await ctx.sock.sendMessage(ctx.jid,{document:Buffer.from(body,'utf8'),mimetype:'text/plain',fileName:'tab-notes.txt',caption:'📝 Your '+names.length+' notes, exported.'},{quoted:ctx.msg});
   return;
  }
  if(sub==='add'||sub==='save'){
   if(a.length<3)return ctx.reply('Format: notes add <name> <text>\nExample: notes add wifi password is 1234');
   const r=addNote(u,a[1],a.slice(2).join(' '));
   if(r.error==='LONG')return ctx.reply(`Note too long. Max ${LIMITS.text} characters.`);
   if(r.error==='FULL')return ctx.reply(`You reached ${LIMITS.notes} notes. Delete one first: notes del <name>`);
   if(r.error)return ctx.reply('Could not save that note.');
   return ctx.reply((r.updated?'✏️ Updated':'✅ Saved')+' note "'+a[1].slice(0,LIMITS.name)+'".');
  }
  if(sub==='del'||sub==='delete'||sub==='remove'){
   if(!a[1])return ctx.reply('Format: notes del <name>');
   return ctx.reply(delNote(u,a[1])?'🗑️ Deleted "'+a[1].slice(0,LIMITS.name)+'".':'No note named "'+a[1].slice(0,LIMITS.name)+'".');
  }
  const t=getNote(u,a[0]);
  return ctx.reply(t!==null?'📝 *'+a[0].slice(0,LIMITS.name)+'*\n'+t:'No note named "'+a[0].slice(0,LIMITS.name)+'". See: notes list');
 }};
