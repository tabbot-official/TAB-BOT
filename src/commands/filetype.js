import {uploaded} from '../utilities/media.js';import {identify} from '../utilities/files.js';
export default {name:'filetype',category:'Utilities',description:'Identify a safe file by content',usage:'filetype (reply to file)',async run(ctx){const f=await uploaded(ctx);const t=await identify(f.body);await ctx.reply(`${t.mime}\n.${t.ext}\n${f.body.length} B`);}};
