import {replyFailure} from '../recovery/reply.js';
import {generateQR,parseQrArgs} from '../qr/index.js';
export default {name:'qr',category:'Image',description:'QR code: text, link, WiFi, colours',usage:'qr [red|blue|green|purple|orange|pink|teal] [size=512] <text or URL>  |  qr wifi <name> [password]',minArgs:1,async run(ctx){
 try{const {text,opts}=parseQrArgs(ctx.args);const image=await generateQR(text,opts);await ctx.sock.sendMessage(ctx.jid,{image,mimetype:'image/png',caption:'QR'},{quoted:ctx.msg});}catch(e){await replyFailure(ctx,'qr',e);}
}};
