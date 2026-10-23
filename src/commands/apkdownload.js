import {runApk} from './apk/index.js';
export default {name:'apkdownload',category:'Downloaders',description:'Find free apps and validated official APKs',usage:'apkdownload <official F-Droid APK URL>',minArgs:1,async run(ctx){return runApk(ctx,'download');}};
