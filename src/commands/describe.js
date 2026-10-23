import {imageAiCommand} from './_imageai.js';
import {describeImage} from '../services/publicAi.js';
import {cohereVision} from '../ai/providers.js';
export default imageAiCommand({name:'describe',aliases:['describeimg'],description:'Detailed description of a photo (AI vision)',perMinute:2,gpu:false,maxSide:1024,service:'Cohere Aya Vision (free tier)',format:'Description',work:async(jpeg,opts)=>{
 try{const r=await cohereVision(jpeg,'Describe this photo in clear, simple English: the main subject, setting, colors, mood, and any readable text. Under 120 words.',opts);return r.text;}
 catch(e){if(e?.code==='NO_KEYS')throw e;return describeImage(jpeg,opts);}
}});
