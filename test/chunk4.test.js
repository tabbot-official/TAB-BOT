import test from 'node:test';import assert from 'node:assert/strict';
import {jokes,quotes,facts} from '../src/games/data.js';
import {trivia,riddles,capitals,flags,emojis,synonyms,antonyms,spelling,words} from '../src/games/brain/bank.js';
import {accepts} from '../src/games/brain/util.js';
const uniq=a=>new Set(a.map(x=>JSON.stringify(x).toLowerCase())).size===a.length;
test('content banks are large and unique',()=>{assert.ok(jokes.length>=100&&quotes.length>=100&&facts.length>=100);for(const b of [jokes,quotes,facts,riddles,capitals,flags,emojis,synonyms,antonyms,spelling])assert.ok(uniq(b));assert.ok(riddles.length>=40&&capitals.length>=100&&flags.length>=100&&emojis.length>=30);for(const k of Object.keys(trivia)){assert.ok(trivia[k].length>=20,k);assert.ok(uniq(trivia[k]),k);}assert.ok(Object.keys(trivia).length>=5);assert.ok(words.easy.length>=20&&words.hard.length>=20);});
test('answer formats work',()=>{const uk=flags.find(f=>f[0]==='🇬🇧');assert.ok(accepts('UK',uk[1]));assert.ok(accepts('usa',flags.find(f=>f[1].includes?.('usa'))[1]));assert.ok(accepts('Delhi',capitals.find(c=>c[0]==='India')[1]));assert.equal(flags.find(f=>f[0]==='🇮🇳')[1],'india');});
test('no empty or oversize entries',()=>{for(const t of [...jokes,...quotes,...facts])assert.ok(t.length>10&&t.length<250);});
