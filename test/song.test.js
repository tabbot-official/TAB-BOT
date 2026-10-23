import test from 'node:test';
import assert from 'node:assert/strict';
import {findClip,formatSong} from '../src/commands/song.js';
test('findClip finds own audio and quoted audio/video', () => {
  assert.ok(findClip({key:{id:'1',remoteJid:'a@s.whatsapp.net'},message:{audioMessage:{seconds:5}}}));
  assert.ok(findClip({key:{id:'1',remoteJid:'a@s.whatsapp.net'},message:{extendedTextMessage:{text:'/song',contextInfo:{stanzaId:'Q',quotedMessage:{videoMessage:{seconds:9}}}}}}));
  assert.equal(findClip({key:{id:'1'},message:{conversation:'x'}}),null);
});
test('formatSong', () => {
  const t=formatSong({match:true,title:'Pee Loon (From "Once")',artist:'Mohit Chauhan',url:'https://www.shazam.com/track/1'});
  assert.match(t,/Pee Loon/);assert.match(t,/Mohit Chauhan/);assert.match(t,/play Pee Loon Mohit/);
  assert.equal(formatSong({match:false}),null);
});
