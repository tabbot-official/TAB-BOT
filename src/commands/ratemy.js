import {imageAiCommand} from './_imageai.js';
import {captionImage} from '../services/publicAi.js';
import {rateFromCaption} from '../fun/ratemy.js';
const base=imageAiCommand({name:'ratemy',aliases:['rate','ratephoto'],description:'AI rates your photo 1-10 with a fun comment (free public AI)',perMinute:2,gpu:false,maxSide:768,service:'BLIP on Hugging Face',format:'Rating',work:async(jpeg,opts)=>rateFromCaption(await captionImage(jpeg,opts))});
export default {...base,usage:'ratemy (send or reply to a photo)'};
