import {runDownloadCommand} from './_download.js';
export default {name:'facebook',aliases:['fb'],category:'Downloaders',description:'Download a public facebook video',usage:'facebook <public video link>',minArgs:1,async run(ctx){return runDownloadCommand(ctx,{expect:'facebook',kind:'video',label:'facebook'});}};
