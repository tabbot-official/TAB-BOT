import {preview} from '../utilities/web.js';
export default {name:'linkpreview',category:'Utilities',description:'Get safe public URL metadata',usage:'linkpreview <URL>',minArgs:1,async run(ctx){const p=await preview(ctx.args[0]);await ctx.reply([p.title,p.site,p.description,p.url,p.image?p.image:''].filter(Boolean).join('\n'));}};
