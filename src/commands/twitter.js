import {runDownloadCommand} from './_download.js';
export default {name:'twitter',aliases:['x', 'tweet'],category:'Downloaders',description:'Download a public twitter video',usage:'twitter <public video link>',minArgs:1,async run(ctx){return runDownloadCommand(ctx,{expect:'twitter',kind:'video',label:'twitter'});}};
