import {runEnhance} from './_enhance.js';
export default {name:'upscale',category:'Image',description:'Upscale a photo',usage:'upscale [local|clipdrop|pixelbin|replicate|snapedit|codeformer] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'upscale')};
