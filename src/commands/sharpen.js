import {runEnhance} from './_enhance.js';
export default {name:'sharpen',category:'Image',description:'Sharpen a photo locally with Sharp',usage:'sharpen [local|clipdrop|pixelbin|replicate] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'sharpen')};
