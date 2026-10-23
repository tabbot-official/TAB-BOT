import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {featOn,featReply} from '../config/features.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {getCached} from '../utils/msgCache.js';
import {pdfToText} from '../readaloud/index.js';
import {askAi} from '../ai/providers.js';
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<3600000);if(a.length>=10)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
const unwrap=(m)=>m?.ephemeralMessage?.message||m?.viewOnceMessage?.message||m?.viewOnceMessageV2?.message||m?.documentWithCaptionMessage?.message||m;
function findPdf(msg){
 const direct=unwrap(msg.message)||{};
 const ctxInfo=direct.extendedTextMessage?.contextInfo||direct.documentMessage?.contextInfo||direct.imageMessage?.contextInfo;
 let quoted=unwrap(ctxInfo?.quotedMessage)||null;
 if(ctxInfo?.stanzaId&&!quoted?.documentMessage){const c=getCached(ctxInfo.stanzaId);if(c)quoted=c.message;}
 for(const h of [direct,quoted]){
  const d=h?.documentMessage;
  if(d&&/pdf/i.test(d.mimetype||''))return {message:{key:msg.key,message:h},node:d};
 }
 return null;
}
export default {name:'askpdf',aliases:['pdfask','docask','chatpdf'],category:'AI',
 description:'Ask questions about a PDF or notes document (study helper)',
 usage:'askpdf <question> (reply to a PDF)',minArgs:1,
 async run(ctx){
  if(!featOn('askpdf'))return featReply(ctx,'askpdf');
  try{
    const media=findPdf(ctx.msg);
    if(!media)return ctx.reply('Reply to a PDF with your question. Example: /askpdf summarize chapter 2');
    if(Number(media.node.fileLength)>20*1048576)return ctx.reply('PDF is too big (max 20MB).');
    if(!userLimit(ctx.sender))return ctx.reply('Limit: 10 PDF questions per hour. Try later.');
    const question=ctx.args.join(' ').trim().slice(0,500);
    if(!question)return ctx.reply('What should I find in the PDF? Example: /askpdf explain the main formula');
    const buf=await downloadMediaMessage(media.message,'buffer',{},{logger,reuploadRequest:ctx.sock.updateMediaMessage});
    let text,pages,read;
    try{({text,pages,read}=await pdfToText(buf,{maxPages:30}));}catch(e){logger.warn('askpdf parse failed: '+(e?.message||'error'));return ctx.reply('Could not read that PDF (it may be scanned images - try /ocr on a photo of the page).');}
    if(!text||text.trim().length<20)return ctx.reply('No readable text in that PDF (it may be scanned images).');
    const excerpt=text.slice(0,14000);
    const sys='You answer questions using ONLY the document text below. If the answer is not in the text, say so. Reply in clear simple English, under 150 words.\n\nDOCUMENT ('+pages+' pages'+(read<pages?', first '+read+' read':'')+'):\n'+excerpt;
    let out;
    try{const r=await askAi(sys+'\n\nQUESTION: '+question);out=r.text;}
    catch(e2){logger.warn('askpdf ai failed: '+(e2?.code||e2?.message||'error'));return ctx.reply('The AI service is busy right now. Try again in a minute.');}
    await ctx.reply('📄 '+out.slice(0,3000)+(pages>read?'\n\n_Note: PDF has '+pages+' pages; I read the first '+read+'._':''));
  }catch(e){logger.warn('askpdf error: '+(e?.message||'error'));await ctx.reply('Could not process that PDF. Try another one.');}
 }};
