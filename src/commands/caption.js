import {imageAiCommand} from './_imageai.js';
import {captionImage} from '../services/publicAi.js';
export default imageAiCommand({name:'caption',aliases:['whatisthis'],description:'Short caption for a photo (free public AI)',perMinute:3,gpu:false,maxSide:1024,service:'BLIP on Hugging Face',format:'Caption',work:captionImage});
