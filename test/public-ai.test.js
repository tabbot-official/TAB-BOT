import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLimiter,pollinationsImage,gradioRun,PublicAiError} from '../src/services/publicAi.js';
import {cleanPrompt} from '../src/commands/imagine.js';
test('limiter caps per hour and inflight',async()=>{const l=makeLimiter('X','XPH',2);assert.ok(l.ok({}));await l.run(async()=>{assert.equal(l.ok({}),false);});await l.run(async()=>1);assert.equal(l.ok({}),false);assert.equal(makeLimiter('Y','YPH',5).ok({Y_ENABLED:'false'}),false);});
test('prompt cleaned',()=>{assert.equal(cleanPrompt(['  a','  b ']),'a b');assert.equal(cleanPrompt(['x'.repeat(500)]).length,300);});
test('pollinations rejects non-image',async()=>{await assert.rejects(()=>pollinationsImage('a',{request:async()=>({data:Buffer.alloc(5000),headers:{'content-type':'text/html'}})}),PublicAiError);});
test('gradio rejects foreign result host',async()=>{
 const {Readable}=await import('node:stream');
 const req=async(o)=>{ if(o.url.endsWith('/queue/data'))return {data:Readable.from([Buffer.from('data: '+JSON.stringify({msg:'process_completed',success:true,output:{data:[{url:'https://evil.example/x.png'}]}})+'\n\n')])}; return {data:[]}; };
 const r=await gradioRun('https://a.hf.space',0,[1],{request:req});
 await assert.rejects(()=>r.fetch({url:'https://evil.example/x.png'}),PublicAiError);});
