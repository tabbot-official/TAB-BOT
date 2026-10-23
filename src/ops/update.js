import crypto from 'node:crypto';import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);// Tab: auto-update from the original Jarvis GitHub repo is OFF (it would overwrite Tab's code and re-enable telemetry).
// Set UPDATE_REPO=owner/repo in .env to pull updates from a repo you control.
export const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(process.env.UPDATE_REPO||'').trim())?String(process.env.UPDATE_REPO).trim():'';
export function allowed(p){return typeof p==='string'&&p!=='scripts/runner.js'&&!p.includes('..')&&!p.includes('\\')&&(/^(src|scripts)\/[a-zA-Z0-9_./-]+\.(js|py)$/.test(p)||/^src\/(?:runtime-locales|locales)\/[a-z]{3}\.json$/.test(p)||p==='src/i18n/registry.json'||['package.json','README.md','CHANGELOG.md','.env.example'].includes(p));}
export function dependencyEqual(a,b){return ['dependencies','optionalDependencies','engines'].every(k=>JSON.stringify(a[k]||{})===JSON.stringify(b[k]||{}));}
export function newer(a,b){if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b))return false;const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
async function get(url){const r=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'Tab-update'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`GitHub request failed (${r.status})`);return r.json();}
export class Updater {
 constructor(root,data,{getJSON=get,getBlob=null}={}){Object.assign(this,{root,data,getJSON,getBlob,pending:null,busy:false,lastCheck:0});}
 async readBlob(entry,commit){
  if(this.getBlob)return this.getBlob(entry.sha);
  if(!/^[a-f0-9]{40}$/.test(entry.sha)||!allowed(entry.path)||entry.size>1048576)throw new Error('Unsafe update file');
  const r=await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/${entry.path}`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Update download failed (${r.status})`);const body=Buffer.from(await r.arrayBuffer());
  if(body.length>1048576||crypto.createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex')!==entry.sha)throw new Error('Update checksum mismatch');return body;
 }
 async check(force=false){
  if(!REPO&&this.getJSON===get){if(force)throw new Error('Updates are off in Tab (no UPDATE_REPO set). Update by downloading a new zip.');return null;}
  if(!force&&Date.now()-this.lastCheck<3600000)return this.pending;this.lastCheck=Date.now();
  const c=await this.getJSON(`https://api.github.com/repos/${REPO}/commits/main`);if(!/^[a-f0-9]{40}$/.test(c.sha))throw new Error('Invalid commit');
  const t=await this.getJSON(`https://api.github.com/repos/${REPO}/git/trees/${c.sha}?recursive=1`);if(t.truncated)throw new Error('Incomplete update tree');
  const p=t.tree.find(x=>x.path==='package.json'&&x.type==='blob'&&x.mode==='100644');if(!p)throw new Error('Missing package');
  const next=JSON.parse((await this.readBlob(p,c.sha)).toString()),old=JSON.parse(await fs.readFile(path.join(this.root,'package.json'),'utf8'));
  const entries=t.tree.filter(x=>allowed(x.path));let changed=false;for(const x of entries){let local;try{local=await fs.readFile(path.join(this.root,x.path));}catch(e){if(e.code!=='ENOENT')throw e;changed=true;continue;}const hash=crypto.createHash('sha1').update(Buffer.from('blob '+local.length+'\0')).update(local).digest('hex');if(hash!==x.sha)changed=true;}if(!changed){this.pending=null;return null;}const blockedReason=dependencyEqual(old,next)?null:'Dependency/runtime changes need a manual tested deployment.';
  const log=t.tree.find(x=>x.path==='CHANGELOG.md'&&x.type==='blob');const notes=log?(await this.readBlob(log,c.sha)).toString().slice(0,3000):String(c.commit?.message||'No changelog supplied').slice(0,1500);
  return this.pending={sha:c.sha,version:next.version,notes,blockedReason,tree:t.tree,expires:Date.now()+600000};
 }
 async install(sha){
  if(this.busy)throw new Error('Update already running');if(!this.pending||this.pending.sha!==sha||Date.now()>this.pending.expires)throw new Error('Run /update again and confirm the displayed commit.');
  if(this.pending.blockedReason)throw new Error(this.pending.blockedReason);this.busy=true;const target=this.pending,tx=path.join(this.data,'update-transaction');let created=false;
  try{
   try{await fs.access(tx);throw new Error('Previous update is still pending');}catch(e){if(e.code!=='ENOENT')throw e;}
   const entries=target.tree.filter(x=>allowed(x.path));if(!entries.length||entries.length>1024||entries.some(x=>x.type!=='blob'||!['100644','100755'].includes(x.mode)))throw new Error('Unsupported update tree');
   const files=[];let bytes=0;for(const x of entries){let ancestor=this.root;for(const part of x.path.split('/')){ancestor=path.join(ancestor,part);try{if((await fs.lstat(ancestor)).isSymbolicLink())throw new Error('Symlink update path refused');}catch(e){if(e.code!=='ENOENT')throw e;}}const body=await this.readBlob(x,target.sha);bytes+=body.length;if(bytes>8388608)throw new Error('Update too large');let old=null;try{old=await fs.readFile(path.join(this.root,x.path));}catch(e){if(e.code!=='ENOENT')throw e;}if(!old?.equals(body))files.push({path:x.path,body,old});}
   if(!files.length)throw new Error('No source changes found');await fs.mkdir(tx,{recursive:true});created=true;
   for(const f of files){for(const [dir,body]of [['new',f.body],['old',f.old]])if(body!==null){const p=path.join(tx,dir,f.path);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,body);}if(f.path.endsWith('.json')){let parsed;try{parsed=JSON.parse(f.body.toString('utf8'));}catch{throw new Error('Invalid update JSON: '+f.path);}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid update JSON object: '+f.path);if(f.path==='src/i18n/registry.json'&&(!parsed.languages||typeof parsed.languages!=='object'||Array.isArray(parsed.languages)||Object.entries(parsed.languages).some(([c,v])=>!/^[a-z]{3}$/.test(c)||!v||typeof v.name!=='string')))throw new Error('Invalid language registry');if(/^src\/(?:runtime-locales|locales)\//.test(f.path)&&Object.values(parsed).some(v=>typeof v!=='string'||!v))throw new Error('Invalid locale text: '+f.path);}if(f.path.endsWith('.js'))await exec(process.execPath,['--check',path.join(tx,'new',f.path)],{timeout:15000});}
   const journal={sha,version:target.version,attempted:false,phase:'applying',files:files.map(f=>({path:f.path,existed:f.old!==null}))};await fs.writeFile(path.join(tx,'journal.json'),JSON.stringify(journal));
   try{for(const f of files){const p=path.join(this.root,f.path);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p+'.update-tmp',f.body);await fs.rename(p+'.update-tmp',p);}}catch(e){await rollback(this.root,this.data);throw e;}
   journal.phase='ready';await fs.writeFile(path.join(tx,'journal.json'),JSON.stringify(journal));this.pending=null;return {sha,version:target.version,files:files.length};
  }catch(e){if(created){try{await fs.access(path.join(tx,'journal.json'));}catch{await fs.rm(tx,{recursive:true,force:true});}}throw e;}finally{this.busy=false;}
 }
}
export async function rollback(root,data){const tx=path.join(data,'update-transaction'),j=JSON.parse(await fs.readFile(path.join(tx,'journal.json'),'utf8'));for(const f of j.files){if(!allowed(f.path))throw new Error('Invalid rollback path');const p=path.join(root,f.path);if(f.existed){await fs.mkdir(path.dirname(p),{recursive:true});await fs.copyFile(path.join(tx,'old',f.path),p);}else await fs.rm(p,{force:true});}await fs.writeFile(path.join(data,'update-result.json'),JSON.stringify({ok:false,sha:j.sha,version:j.version}));await fs.rm(tx,{recursive:true,force:true});}
export async function healthy(data){const tx=path.join(data,'update-transaction');try{const j=JSON.parse(await fs.readFile(path.join(tx,'journal.json'),'utf8'));await fs.writeFile(path.join(data,'update-result.json'),JSON.stringify({ok:true,sha:j.sha,version:j.version}));await fs.rm(tx,{recursive:true,force:true});clearTimeout(globalThis.__jarvisUpdateTimer);}catch(e){if(e.code!=='ENOENT')throw e;}}
