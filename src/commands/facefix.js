import {imageAiCommand} from './_imageai.js';
import {restoreFace} from '../services/publicAi.js';
export default imageAiCommand({name:'facefix',aliases:['fixface','faceai'],description:'Restore blurry or old faces with free AI (CodeFormer)',perMinute:2,gpu:true,maxSide:768,service:'CodeFormer on Hugging Face',format:'Face restored',work:restoreFace});
