import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRequest,validate,rateCheck,providerNames} from '../src/tts/index.js';
import {LANGS,detectLang} from '../src/tts/voices.js';
test('speech parser supports language, gender, named voice and quoted text',()=>{
 assert.deepEqual(parseRequest(['hi','male','Namaste']),{lang:'hi',voice:null,gender:'male',text:'Namaste'});
 assert.equal(parseRequest(['en','neerja','Hello']).voice,'en-IN-NeerjaNeural');
 assert.equal(parseRequest([], 'Quoted words').text,'Quoted words');
 assert.equal(parseRequest(['Hello','world']).text,'Hello world');
});
test('speech validation rejects blank, emoji-only and long text',()=>{
 assert.throws(()=>validate(''));assert.throws(()=>validate('🙂'));assert.throws(()=>validate('a'.repeat(501)));validate('Hello');
});
test('speech providers, languages and rate limit',()=>{
 assert.equal(Object.keys(LANGS).length,23);
 assert.equal(detectLang('नमस्ते'),'hi');
 assert.deepEqual(providerNames(),['edge','google']);
 for(let i=0;i<5;i++)assert.equal(rateCheck('test',1000+i),0);
 assert.ok(rateCheck('test',1006)>0);assert.equal(rateCheck('test',62000),0);
});
