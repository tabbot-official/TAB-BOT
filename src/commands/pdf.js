import {pdf} from '../utilities/text.js';
export default {name:'pdf',category:'Utilities',description:'English text to a PDF',usage:'pdf <text>',minArgs:1,async run(ctx){const document=await pdf(ctx.args.join(' '));await ctx.sock.sendMessage(ctx.jid,{document,mimetype:'application/pdf',fileName:'text.pdf'},{quoted:ctx.msg});}};
