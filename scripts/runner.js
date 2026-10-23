// Stable entry point, deliberately excluded from automatic source updates.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import 'dotenv/config';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const data=path.resolve(root,process.env.DATA_FOLDER||'data');const tx=path.join(data,'update-transaction');
let journal;try{journal=JSON.parse(await fs.readFile(path.join(tx,'journal.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(journal){
 if(journal.attempted||journal.phase!=='ready'){
  for(const f of journal.files){if(!/^src\/(?:runtime-locales|locales)\/[a-z]{3}\.json$/.test(f.path)&&f.path!=='src/i18n/registry.json'&&!/^(src|scripts)\/[a-zA-Z0-9_./-]+\.(js|py)$/.test(f.path)&&!['package.json','package-lock.json','README.md','CHANGELOG.md','.env.example'].includes(f.path))throw new Error('Bad rollback path');if(f.path.includes('..')||f.path.includes('\\'))throw new Error('Bad rollback path');const p=path.join(root,f.path);if(f.existed){await fs.mkdir(path.dirname(p),{recursive:true});await fs.copyFile(path.join(tx,'old',f.path),p);}else await fs.rm(p,{force:true});}
  await fs.writeFile(path.join(data,'update-result.json'),JSON.stringify({ok:false,sha:journal.sha,version:journal.version}));await fs.rm(tx,{recursive:true,force:true});
 }else{
  journal.attempted=true;await fs.writeFile(path.join(tx,'journal.json'),JSON.stringify(journal));
  const t=setTimeout(()=>{console.error('[Tab] Update health timeout. Restarting for rollback.');process.exit(1);},90000);t.unref();globalThis.__jarvisUpdateTimer=t;
 }
}
await import('../src/index.js');
