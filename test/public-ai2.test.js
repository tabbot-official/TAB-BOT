import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {transcribeAudio,translateText,ocrImage} from '../src/services/publicAi.js';
import {parseTranslate} from '../src/commands/translate.js';
import {findAudio} from '../src/commands/stt.js';
function fake(result,seen=[]){return async(o)=>{seen.push(o.url);if(o.url.endsWith('/upload'))return {data:['/tmp/gradio/x/a.wav']};if(o.url.endsWith('/queue/join'))return {data:{}};return {data:Readable.from([Buffer.from('data: '+JSON.stringify({msg:'process_completed',success:true,output:{data:[result]}})+'\n\n')])};};}
test('stt returns transcript via whisper space',async()=>{const seen=[];assert.equal(await transcribeAudio(Buffer.from('x'),{request:fake(' hello there ',seen)}),'hello there');assert.ok(seen[0].includes('openai-whisper.hf.space/gradio_api/upload'));});
test('translate uses unprefixed gradio 4 paths',async()=>{const seen=[];assert.equal(await translateText('hi','Auto Detect','Hindi',{request:fake('नमस्ते',seen)}),'नमस्ते');assert.ok(seen.every((u)=>!u.includes('/gradio_api')));});
test('ocr returns text',async()=>{assert.equal(await ocrImage(Buffer.from('x'),{request:fake('A B ')}),'A B');});
test('translate parse',()=>{assert.deepEqual(parseTranslate(['hindi','good','morning']),{to:'Hindi',text:'good morning'});assert.deepEqual(parseTranslate(['hi'],'hello'),{to:'Hindi',text:'hello'});assert.deepEqual(parseTranslate(['good','day']),{to:'English',text:'good day'});assert.equal(parseTranslate([]).error,'usage');});
test('findAudio direct and quoted',()=>{const key={remoteJid:'j',id:'1'};assert.ok(findAudio({key,message:{audioMessage:{ptt:true}}}));const r=findAudio({key,message:{extendedTextMessage:{text:'/stt',contextInfo:{stanzaId:'q1',participant:'p',quotedMessage:{audioMessage:{seconds:3}}}}}});assert.equal(r.message.key.id,'q1');assert.equal(findAudio({key,message:{conversation:'x'}}),null);});
