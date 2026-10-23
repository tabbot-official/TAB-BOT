import {imageAiCommand} from './_imageai.js';
import {depthImage} from '../services/publicAi.js';
export default imageAiCommand({name:'depth',aliases:['depthmap'],description:'Depth map of a photo (free public AI)',perMinute:2,gpu:true,maxSide:1024,service:'Depth-Anything-V2 on Hugging Face',format:'Depth map',work:depthImage});
