import {runEnhance} from './_enhance.js';
export default {name:'restore',category:'Image',description:'Restore faces using an approved external provider',usage:'restore [local|clipdrop|pixelbin|replicate|snapedit|codeformer] [1|2|4] [yes] (reply to photo)',run:ctx=>runEnhance(ctx,'restore')};
