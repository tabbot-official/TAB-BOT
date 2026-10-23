import {parseTweet,tweetSvg} from '../fun/faketweet.js';
export default {name:'faketweet',aliases:['fakett','tweetpic'],category:'Image',description:'Make a fake tweet image (for fun)',usage:'faketweet Name | @handle | text   (handle optional)',minArgs:1,
 async run(ctx){
  const t=parseTweet(ctx.args);
  if(!t)return ctx.reply('Format: faketweet Name | @handle | your text\nExample: faketweet Rohan | @rohan | Tab is the best bot');
  try{
   const {default:sharp}=await import('sharp');
   const png=await sharp(Buffer.from(tweetSvg(t))).png({compressionLevel:9}).toBuffer();
   return await ctx.sock.sendMessage(ctx.jid,{image:png,caption:'😂 Fake tweet - made for fun, not real.'},{quoted:ctx.msg});
  }catch{return ctx.reply('Could not create the image right now. Try again.');}
 }};
