import fs from 'node:fs/promises';import {prepareWhatsAppVideo} from './whatsappVideo.js';
import {fileTypeFromFile} from 'file-type';
import config from '../config/config.js';

// Tab: audio-only downloads often come in a video container. YouTube's m4a has the DASH brand, which file-type
// reports as video/mp4, and opus audio comes as webm/mkv. A claimed audio file in one of these is still audio.
export const AUDIO_CONTAINERS=new Set(['video/mp4','video/webm','video/x-matroska','video/3gpp','video/ogg','video/quicktime']);

/** Sends one downloaded file to a chat using the best WhatsApp message type. */
export async function sendMediaFile(sock, jid, file, quoted, caption = '',options = {}) {
  const detected=await fileTypeFromFile(file.path);
  if(!detected||!['image/','video/','audio/'].some(p=>detected.mime.startsWith(p)))throw new Error('Downloaded content is unsupported or suspicious');
  if(file.type&&['image','video','audio'].includes(file.type)&&!detected.mime.startsWith(file.type+'/')&&!(file.type==='audio'&&AUDIO_CONTAINERS.has(detected.mime)))throw new Error('Downloaded media does not match its claimed type');
  const originalPath=file.path;
  if(file.type==='video')file=await prepareWhatsAppVideo(file,options);
  const source = { url: file.path }; // streamed from disk, not loaded into RAM
  let content;
  if (file.type === 'audio') {
    content = { audio: source, mimetype: file.mimetype || 'audio/mp4', ptt: false };
  } else if (file.type === 'image') {
    content = { image: source, caption };
  } else if (file.type === 'video') {
    if (file.conversion === 'video-transcode') caption = caption ? caption + '\n🗜️ Compressed to fit WhatsApp' : '🗜️ Compressed to fit WhatsApp';
    content = { video: source, mimetype: 'video/mp4', caption };
  } else {
    content = { document: source, mimetype: file.mimetype || 'application/octet-stream', fileName: file.fileName || 'file', caption };
  }
  try{return await sock.sendMessage(jid, content, { quoted });}finally{if(file.type==='video'&&file.path!==originalPath)await fs.rm(file.path,{force:true});}
}
