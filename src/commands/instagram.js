import {runDownloadCommand} from './_download.js';
export default {name:'instagram',aliases:['ig', 'insta'],category:'Downloaders',description:'Download a public instagram video',usage:'instagram <public video link>',minArgs:1,async run(ctx){return runDownloadCommand(ctx,{expect:'instagram',kind:'video',label:'instagram'});}};
