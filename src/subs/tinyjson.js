import fs from 'node:fs';import path from 'node:path';
export class TinyJson {
 constructor(file,def={}){this.file=file;this.data=def;try{this.data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}}
 save(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}catch{}}
}
