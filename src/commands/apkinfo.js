import {runApk} from './apk/index.js';
export default {name:'apkinfo',category:'Downloaders',description:'Find free apps and validated official APKs',usage:'apkinfo <package ID>',minArgs:1,async run(ctx){return runApk(ctx,'info');}};
