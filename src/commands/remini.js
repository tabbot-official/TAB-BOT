import {runEnhance} from './_enhance.js';
export default {name:'remini',aliases:['enhance'],category:'Image',description:'Enhance/upscale a photo; local baseline or configured provider',usage:'remini [local|clipdrop|pixelbin|replicate|snapedit|codeformer] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'upscale')};
