import test from 'node:test';import assert from 'node:assert/strict';
import truths from '../src/games/truthdare/truths.js';import dares from '../src/games/truthdare/dares.js';
import {CATEGORIES,parseCategory,draw,pool,counts} from '../src/games/truthdare/index.js';
const flat=b=>Object.values(b).flat();
test('banks have 1000+ unique prompts each, all categories',()=>{for(const b of [truths,dares]){const a=flat(b);assert.ok(a.length>=1000);assert.equal(new Set(a.map(s=>s.toLowerCase())).size,a.length);for(const c of CATEGORIES)assert.ok(b[c].length>=50,c);}assert.ok(counts().truth>=1000&&counts().dare>=1000);});
test('no repeat until pool exhausted',()=>{const n=pool('truth','sad').length,s=new Set();for(let i=0;i<n;i++)s.add(draw('truth','sad','t1').t);assert.equal(s.size,n);});
test('category parsing',()=>{assert.equal(parseCategory('Funny').cat,'funny');assert.equal(parseCategory('logic').cat,'irl');assert.equal(parseCategory().cat,null);assert.ok(parseCategory('xyz').error);});
test('commands load',async()=>{for(const n of ['truth','dare','tod'])assert.equal((await import('../src/commands/'+n+'.js')).default.name,n);});
