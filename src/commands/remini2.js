import {runEnhance} from './_enhance.js';
export default {name:'remini2',aliases:[],category:'Image',description:'Enhance/upscale a photo; local baseline or configured provider',usage:'remini2 [local|clipdrop|pixelbin|replicate|snapedit|codeformer] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'upscale')};
