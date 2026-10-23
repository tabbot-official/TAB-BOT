// Typerace sessions: in-memory only, per group chat.
const sessions=new Map();
const SENTENCES=[
'The quick brown fox jumps over the lazy dog near the river bank.',
'Practice makes perfect when you type a little every single day.',
'A journey of a thousand miles begins with one small step forward.',
'Good friends are like stars; you do not always see them but they are there.',
'The early morning sun painted the quiet streets in shades of gold.',
'Success usually comes to those who are too busy to be looking for it.',
'Books open doors to worlds that no one has ever walked through before.',
'A calm mind brings inner strength and confidence in hard times.',
'Technology works best when it brings people closer to each other.',
'The best way to predict the future is to create it yourself today.',
'Every expert was once a beginner who refused to give up trying.',
'Small daily improvements add up to stunning results over the year.',
];
const TTL=3*60000;
export function getRace(jid){const s=sessions.get(jid);if(s&&Date.now()-s.startedAt>TTL){sessions.delete(jid);return null;}return s||null;}
export function startRace(jid){
 const sentence=SENTENCES[Math.floor(Math.random()*SENTENCES.length)];
 const s={sentence,startedAt:Date.now(),openAt:Date.now()+5000,winner:null,attempts:{}};
 sessions.set(jid,s);return s;
}
export function stopRace(jid){sessions.delete(jid);}
export function normalize(t){return String(t||'').trim().replace(/\s+/g,' ');}
export function tryFinish(jid,user,text){
 const s=getRace(jid);if(!s||s.winner||Date.now()<s.openAt)return null;
 const typed=normalize(text);
 if(typed.toLowerCase()!==s.sentence.toLowerCase())return null;
 const secs=(Date.now()-s.startedAt-5000)/1000;
 const words=s.sentence.split(' ').length;
 const wpm=Math.max(1,Math.round(words/(secs/60)));
 // accuracy vs exact case
 let correct=0;for(let i=0;i<Math.min(typed.length,s.sentence.length);i++)if(typed[i]===s.sentence[i])correct++;
 const acc=Math.round(correct/s.sentence.length*100);
 s.winner={user,secs:Math.round(secs*10)/10,wpm,acc};
 sessions.delete(jid);
 return s.winner;
}
