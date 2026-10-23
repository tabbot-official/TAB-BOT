import {runEnhance} from './_enhance.js';
export default {name:'denoise',category:'Image',description:'Reduce noise locally with Sharp',usage:'denoise [local|clipdrop|pixelbin|replicate] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'denoise')};
