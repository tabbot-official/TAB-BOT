import {runApk} from './apk/index.js';
export default {name:'apk',category:'Downloaders',description:'Find free apps and validated official APKs',usage:'apk <app name or package ID>',minArgs:1,async run(ctx){return runApk(ctx,'app');}};
