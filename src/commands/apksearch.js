import {runApk} from './apk/index.js';
export default {name:'apksearch',category:'Downloaders',description:'Find free apps and validated official APKs',usage:'apksearch <query>',minArgs:1,async run(ctx){return runApk(ctx,'search');}};
