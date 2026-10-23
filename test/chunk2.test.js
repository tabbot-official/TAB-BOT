import test from 'node:test';import assert from 'node:assert/strict';
import {esc,memeUrl,safeUrl} from '../src/commands/_memegen.js';import {parseQrArgs,generateQR} from '../src/qr/index.js';
test('meme text escaping',()=>{assert.equal(esc('a b_c-d?'),'a_b__c--d~q');assert.equal(esc(''),'_');assert.match(memeUrl('drake','hi there','x/y'),/drake\/hi_there\/x~sy\.jpg/);});
test('short url validation',()=>{assert.ok(safeUrl('https://example.com/a?b=1'));for(const u of ['ftp://x.com','http://localhost/x','http://127.0.0.1','https://u:p@a.com','notaurl','http://intranet/x','https://a.local/x'])assert.equal(safeUrl(u),null,u);});
test('qr wifi and colour args',async()=>{assert.equal(parseQrArgs(['wifi','Home','pw']).text,'WIFI:T:WPA;S:Home;P:pw;;');assert.equal(parseQrArgs(['wifi','Open']).text,'WIFI:T:nopass;S:Open;;');const r=parseQrArgs(['blue','size=300','hi']);assert.equal(r.text,'hi');assert.equal(r.opts.width,300);assert.ok((await generateQR('hi',r.opts)).length>100);assert.throws(()=>parseQrArgs(['wifi']));});
test('meme/short commands load',async()=>{for(const n of ['meme','short'])assert.equal((await import('../src/commands/'+n+'.js')).default.name,n);});
