import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const positive=n=>Number.isSafeInteger(n)&&n>0;
const text=x=>typeof x==='string'&&x.length>0;
/** Reject incomplete, tampered, or unlabelled editions rather than inventing missing text. */
export function validateEdition(index,full){
 if(index?.schema!==1||!text(index.id)||!text(index.title)||!text(index.language)||!text(index.edition)||!text(index.rights)||!Array.isArray(index.sources)||!index.sources.length||index.sources.some(x=>!/^https:\/\//.test(x)))throw Error('Book edition metadata invalid');
 if(!Buffer.isBuffer(full)||!full.length||sha256(full)!==index.fullSha256)throw Error('Full book integrity check failed');
 if(!Array.isArray(index.books)||!index.books.length)throw Error('Book contents missing');
 let chapterCount=0,verseCount=0;
 for(const [bi,b]of index.books.entries()){
  if(b.number!==bi+1||!text(b.name)||!Array.isArray(b.chapters)||!b.chapters.length)throw Error('Book contents invalid');
  for(const [ci,c]of b.chapters.entries()){
   if(c.number!==ci+1||!Array.isArray(c.verses)||!c.verses.length)throw Error('Chapter numbering invalid');
   for(const [vi,v]of c.verses.entries()){
    if(v.number!==vi+1||(!text(v.text)&&!(v.noteOnly===true&&v.text===''&&Array.isArray(v.notes)&&v.notes.every(text))))throw Error('Verse numbering/text invalid');
    verseCount++;
   }
   chapterCount++;
  }
 }
 if(index.counts?.books!==index.books.length||index.counts?.chapters!==chapterCount||index.counts?.verses!==verseCount)throw Error('Edition completeness counts disagree');
 return index;
}
export function label(index){return `${index.title}\n${index.language} | ${index.edition}\nSource: ${index.sources[0]}`;}
export function contents(index){return index.books.map(b=>({number:b.number,name:b.name,chapters:b.chapters.length}));}
/** Explicit numeric references are unambiguous across translated book names. */
export function select(index,{book=1,chapter,first=1,last}={}){
 if(!positive(book)||!positive(chapter)||!positive(first)||(last!==undefined&&!positive(last)))throw Error('Use positive book/chapter/verse numbers');
 const b=index.books[book-1],c=b?.chapters[chapter-1];
 if(!c)throw Error('Book or chapter does not exist in this edition');
 last??=c.verses.length;
 if(first>last||last>c.verses.length)throw Error('Verse range does not exist in this edition');
 return {book:b,chapter:c,verses:c.verses.slice(first-1,last)};
}
/** Bound individual chat pages; concatenating chunks preserves every original character. */
export function chunks(value,max=3000){
 if(!Number.isInteger(max)||max<200||max>4000)throw Error('Page size must be200-4000characters');
 const characters=Array.from(value),out=[];
 for(let start=0;start<characters.length;start+=max)out.push(characters.slice(start,start+max).join(''));
 return out;
}
export function readingPages(index,reference,max=3000){
 const selected=select(index,reference);
 const body=selected.verses.map(v=>`${selected.book.number}:${selected.chapter.number}:${v.number}\n${v.noteOnly?'[Edition has a textual note, not main verse text.]':v.text}${v.notes?.length?'\n[Source notes]\n'+v.notes.join('\n'):''}`).join('\n\n');
 const pages=chunks(body,max);
 return pages.map((body,i)=>({body,page:i+1,total:pages.length,edition:label(index)}));
}
export async function loadEdition(root,id){
 if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id))throw Error('Invalid book edition ID');
 const dir=path.join(root,id);
 // Never traverse symbolic links into private data.
 for(const p of [root,dir,path.join(dir,'index.json'),path.join(dir,'full.txt')])if((await fs.lstat(p)).isSymbolicLink())throw Error('Book symlink refused');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 const bytes=await fs.readFile(path.join(dir,'index.json'));
 if(sha256(bytes)!==manifest[id]?.indexSha256)throw Error('Book index integrity check failed');
 const index=JSON.parse(bytes.toString('utf8'));
 const full=await fs.readFile(path.join(dir,'full.txt'));
 if(sha256(full)!==manifest[id]?.fullSha256)throw Error('Book manifest full integrity check failed');
 if(index.id!==id)throw Error('Book edition ID mismatch');
 validateEdition(index,full);
 return {index,full};
}
