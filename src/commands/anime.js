import {imageAiCommand} from './_imageai.js';
import {animeImage} from '../services/publicAi.js';
export default imageAiCommand({name:'anime',aliases:['toanime','animegan'],description:'Turn a photo into anime style (free public AI)',perMinute:2,gpu:true,maxSide:768,service:'AnimeGANv2 on Hugging Face',format:'Anime style',work:animeImage});
