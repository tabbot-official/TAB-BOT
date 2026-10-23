import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {captionImage,animeImage,depthImage,PublicAiError} from '../src/services/publicAi.js';
function fake(output,seen=[],ok=true){return async(o)=>{seen.push(o.url);if(o.url.endsWith('/upload'))return {data:['/tmp/gradio/x/a.jpg']};if(o.url.endsWith('/queue/join'))return {data:{}};if(o.url.includes('/queue/data'))return {data:Readable.from([Buffer.from('data: '+JSON.stringify({msg:'process_completed',success:ok,output})+'\n\n')])};return {data:Buffer.from('imgbytes')};};}
test('caption strips BLIP artifact and timing line',async()=>{assert.equal(await captionImage(Buffer.from('x'),{request:fake({data:['araffe dog on grass\n⏱ Took 2 seconds']})}),'dog on grass');});
test('gpu quota error is flagged',async()=>{await assert.rejects(()=>animeImage(Buffer.from('x'),{request:fake({error:'You have exceeded your free ZeroGPU quota (60s requested vs. 0s left)'},[],false)}),(e)=>e instanceof PublicAiError&&e.quota===true);});
test('depth takes second output file',async()=>{const seen=[];const out=await depthImage(Buffer.from('x'),{request:fake({data:[[{url:'https://depth-anything-depth-anything-v2.hf.space/gradio_api/file=/a'}],{url:'https://depth-anything-depth-anything-v2.hf.space/gradio_api/file=/gray.png'},null]},seen)});assert.ok(out.length>0);assert.ok(seen.some((u)=>u.endsWith('/gray.png')));});
