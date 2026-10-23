// Owner dashboard page: server-rendered first paint, then updated in place once per second from /api/stats (no reloads).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const mb = (n) => (n ? Math.round(n / 1048576) + ' MB' : '-');
const dur = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
const CSS = `
:root{--bg:#060b16;--c1:#22d3ee;--c2:#818cf8;--c3:#f472b6;--ok:#34d399;--bad:#fb7185;--tx:#e6f1ff;--mu:#8aa0bd}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--tx);background:var(--bg);overflow-x:hidden}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden}
.bg i{position:absolute;width:55vmax;height:55vmax;border-radius:50%;filter:blur(90px);opacity:.28;animation:drift 22s ease-in-out infinite alternate}
.bg i:nth-child(1){background:var(--c1);left:-20vmax;top:-20vmax}.bg i:nth-child(2){background:var(--c2);right:-22vmax;top:15vh;animation-delay:-7s}.bg i:nth-child(3){background:var(--c3);left:10vw;bottom:-30vmax;animation-delay:-13s;opacity:.18}
@keyframes drift{to{transform:translate(8vmax,6vmax) scale(1.15)}}
.wrap{max-width:980px;margin:0 auto;padding:16px 14px 40px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:6px 0 16px}
h1{margin:0;font-size:clamp(24px,6vw,34px);letter-spacing:.2px;background:linear-gradient(90deg,var(--c1),var(--c2),var(--c3));-webkit-background-clip:text;background-clip:text;color:transparent;background-size:200% 100%;animation:shine 6s linear infinite}
@keyframes shine{to{background-position:200% 0}}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-weight:600;font-size:13px;white-space:nowrap}
.dot{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 var(--ok);animation:ping 1.6s infinite}.off .dot{background:var(--bad);box-shadow:0 0 0 0 var(--bad)}
@keyframes ping{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
.clock{text-align:right;line-height:1.1}.clock b{display:block;font-size:clamp(26px,7vw,38px);font-variant-numeric:tabular-nums;letter-spacing:1px;text-shadow:0 0 22px rgba(34,211,238,.45)}.clock small{display:block;text-align:right;color:var(--mu)}.bars:empty::after,.rec:empty::after{content:"Nothing yet";color:var(--mu);font-size:13px;padding:6px 2px;display:block}
.grid{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}@media(min-width:720px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{position:relative;padding:14px;border-radius:18px;background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,.35);animation:up .6s both;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-3px);border-color:rgba(34,211,238,.45)}
@keyframes up{from{opacity:0;transform:translateY(14px)}}
.card small{display:flex;align-items:center;gap:6px;color:var(--mu);font-size:12px;text-transform:uppercase;letter-spacing:.8px}
.card b{display:block;margin-top:6px;font-size:clamp(22px,6vw,28px);font-variant-numeric:tabular-nums;white-space:nowrap}
.card em{font-style:normal;color:var(--mu);font-size:12px;white-space:nowrap}
.span2{grid-column:span 2}
.gauge{display:flex;align-items:center;gap:14px}.ring{width:84px;height:84px;flex:none;transform:rotate(-90deg)}.ring circle{fill:none;stroke-width:9;stroke-linecap:round}.ring .t{stroke:rgba(255,255,255,.08)}.ring .v{stroke:url(#g);stroke-dasharray:263.9;stroke-dashoffset:263.9;transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)}
.spark{width:100%;height:34px;margin-top:8px;display:block}.spark polyline{fill:none;stroke:var(--c1);stroke-width:1.6;vector-effect:non-scaling-stroke}.spark path{fill:rgba(34,211,238,.12)}
h3{margin:22px 4px 10px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--mu)}
.bars{display:grid;gap:8px}.bar{position:relative;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.05);overflow:hidden;display:flex;justify-content:space-between;gap:10px;animation:up .5s both}
.bar::before{content:"";position:absolute;inset:0;width:var(--w,0%);background:linear-gradient(90deg,rgba(34,211,238,.35),rgba(129,140,248,.25));transition:width .8s cubic-bezier(.2,.8,.2,1)}
.bar span,.bar strong{position:relative;font-variant-numeric:tabular-nums}.bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rec{list-style:none;margin:0;padding:0;display:grid;gap:6px}.rec li.act{display:flex;justify-content:space-between;align-items:center;gap:10px}.rec .cmd{font-weight:700;color:#e6f2ff}.rec .cmd::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#22d3ee,#f472b6);margin-right:9px}.rec .who{color:#8fb4ff;font-weight:500;font-size:12px;margin-left:8px}.rec .tm{color:var(--mu);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}.rec li{padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.04);color:#c3d3ea;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:up .4s both}
#eco .bar,#eco li,#e-detail{animation:none}
footer{margin-top:22px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--mu);font-size:12px}
.bad{color:var(--bad)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
const JS = `
(()=>{const $=i=>document.getElementById(i);const TZ='Asia/Kolkata';
const tf=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const df=new Intl.DateTimeFormat('en-IN',{timeZone:TZ,weekday:'short',day:'numeric',month:'short',year:'numeric'});
const base=new URL(location.href);base.search='';base.hash='';if(!base.pathname.endsWith('/'))base.pathname+='/';const API=new URL('api/stats',base).href;
const C=263.9;let up=0,upAt=Date.now(),cpuH=[],ramH=[],last=null,lastU='',lastR='';
const mb=n=>n?Math.round(n/1048576)+' MB':'-';
const dur=s=>Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m '+(s%60)+'s';
function tween(el,to){const from=Number(el.dataset.v||0);el.dataset.v=to;if(from===to||matchMedia('(prefers-reduced-motion:reduce)').matches){el.textContent=to;return}const t0=performance.now();const f=t=>{const k=Math.min(1,(t-t0)/500);el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
function spark(id,h,max){const el=$(id);if(!el||h.length<2)return;const pts=h.map((v,i)=>(i/(h.length-1)*100).toFixed(1)+','+(30-Math.min(1,v/max)*28).toFixed(1));el.querySelector('polyline').setAttribute('points',pts.join(' '));el.querySelector('path').setAttribute('d','M0,30 L'+pts.join(' L')+' L100,30 Z')}
function ring(id,p){$(id).style.strokeDashoffset=(C*(1-Math.max(0,Math.min(1,p)))).toFixed(1)}
function apply(s){last=s;up=s.uptimeSec;upAt=Date.now();
$('wa').textContent=s.wa;$('pill').className='pill'+(s.wa==='online'?'':' off');
const rp=s.ramLimit?s.ramUsed/s.ramLimit:0;$('ramv').textContent=mb(s.ramUsed);$('raml').textContent='of '+mb(s.ramLimit)+' ('+Math.round(rp*100)+'%)';ring('ramr',rp);
$('cpuv').textContent=s.cpuPct+'%';ring('cpur',s.cpuPct/100);
cpuH.push(s.cpuPct);ramH.push(s.ramUsed);if(cpuH.length>60){cpuH.shift();ramH.shift()}spark('cpus',cpuH,Math.max(20,...cpuH));spark('rams',ramH,s.ramLimit||Math.max(...ramH));
tween($('cmds'),s.totalCommands);tween($('dl'),s.downloads);tween($('fail'),s.failures);tween($('plug'),s.plugins);$('fail').className=s.failures>0?'bad':'';
$('disk').textContent=mb(s.diskFree);
const top=(s.usage||[]).slice(0,10);const u=JSON.stringify(top);if(u!==lastU){lastU=u;const mx=Math.max(1,...top.map(x=>x[1]));const box=$('top');box.textContent='';top.forEach((x,i)=>{const d=document.createElement('div');d.className='bar';d.style.setProperty('--w',(x[1]/mx*100)+'%');d.style.animationDelay=(i*40)+'ms';const a=document.createElement('span');a.textContent='/'+x[0];const b=document.createElement('strong');b.textContent=x[1];d.append(a,b);box.append(d)})}
const rec=(s.recent||[]).map(r=>typeof r==='string'?{name:r.slice(0,40),at:0,who:''}:{name:String((r&&r.name)||'?').slice(0,40),at:Number(r&&r.at)||0,who:String((r&&r.who)||'').slice(0,24)}).sort((a,b)=>b.at-a.at).slice(0,8);const r=JSON.stringify(rec);if(r!==lastR){lastR=r;const ul=$('rec');ul.textContent='';rec.forEach(x=>{const li=document.createElement('li');li.className='act';const a=document.createElement('span');a.className='cmd';a.textContent='/'+x.name.replace(/^[/]/,'');const t=document.createElement('span');t.className='tm';if(x.at){t.dataset.at=x.at}if(x.who){const w=document.createElement('span');w.className='who';w.textContent='by '+x.who;a.append(w)}li.append(a,t);ul.append(li)});ticks()}
$('live').textContent='Live, every 1s';$('live').className=''}
const hms=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const ago=t=>{const s=Math.max(0,Math.round((Date.now()-t)/1000));const u=(n,w)=>n+' '+w+(n===1?'':'s')+' ago';return s<5?'just now':s<60?u(s,'second'):s<3600?u(Math.floor(s/60),'minute'):s<86400?u(Math.floor(s/3600),'hour'):u(Math.floor(s/86400),'day')};
function ticks(){document.querySelectorAll('#rec .tm[data-at]').forEach(e=>{const at=Number(e.dataset.at);e.textContent=hms.format(at)+'  ·  '+ago(at)})}
function clock(){ticks();const n=new Date();$('time').textContent=tf.format(n);$('date').textContent=df.format(n);$('up').textContent=dur(up+Math.floor((Date.now()-upAt)/1000))}
async function poll(){if(!document.hidden){try{const r=await fetch(API,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw 0;apply(await r.json());$('seen').textContent=tf.format(new Date())}catch{$('live').textContent='Reconnecting...';$('live').className='bad'}}setTimeout(poll,1000)}

const EAPI=new URL('api/installs',base).href;
function eco(j){if(!j||!j.enabled)return;$('eco').hidden=false;$('e-total').textContent=j.total;$('e-7d').textContent=j.active7d;$('e-24h').textContent=j.active24h;$('e-on').textContent=j.online;$('e-up').textContent=dur(j.medianUptime||0);
const g=j.github||{};$('g-s').textContent=g.stars??'-';$('g-f').textContent=g.forks??'-';$('g-w').textContent=g.watchers??'-';
const mx=Math.max(1,...(j.top||[]).map(x=>x[1]));const b=$('e-top');b.textContent='';(j.top||[]).forEach((x,i)=>{const d=document.createElement('div');d.className='bar';d.style.setProperty('--w',(x[1]/mx*100)+'%');const a=document.createElement('span');a.textContent='/'+x[0];const c=document.createElement('strong');c.textContent=x[1];d.append(a,c);b.append(d)});
const ul=$('e-list');ul.textContent='';(j.installs||[]).slice(0,20).forEach(i=>{const li=document.createElement('li');const ago=Math.max(0,Math.round((Date.now()-i.last)/60000));li.style.cursor='pointer';li.dataset.sid=i.sid;li.title='Click for details';li.textContent=(i.on?'🟢 ':'⚪ ')+(i.fl?'🚩 ':'')+(i.dir?'⛔ ':'')+i.sid+(i.owner?' (owner)':'')+(i.env?' ['+i.env+']':'')+(i.last?'  v'+i.ver+'  seen '+(ago<60?ago+'m':Math.round(ago/60)+'h')+' ago':'  not seen yet');ul.append(li)});
$('e-ver').textContent='Versions: '+(j.versions||[]).map(v=>v[0]+' x'+v[1]).join(', ')+((j.hosting||[]).length?'  |  Hosting: '+j.hosting.map(v=>v[0]+' x'+v[1]).join(', '):'');$('e-key').textContent=j.directiveKey?'Directive public key (pin in src/telemetry/pubkey.js): '+j.directiveKey:''}
const fmtT=t=>t?new Date(t).toLocaleString('en-GB',{timeZone:TZ}):'-';
$('e-list').addEventListener('click',async e=>{const li=e.target.closest('li');if(!li||!li.dataset.sid)return;const box=$('e-detail');box.hidden=false;box.textContent='Loading...';try{const r=await fetch(new URL('api/install?sid='+encodeURIComponent(li.dataset.sid),base).href,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw 0;const d=await r.json();box.textContent='';const t=document.createElement('b');t.textContent=d.sid+(d.owner?' (owner)':'');box.append(t);const p=document.createElement('div');p.style.cssText='color:var(--mu);font-size:13px;margin-top:6px;line-height:1.6';p.textContent='Version '+d.ver+(d.env?' | Hosting '+d.env:'')+' | '+(d.on?'Online':'Offline')+' | Uptime '+dur(d.up)+' | Pings '+d.pings+' | First seen '+fmtT(d.first)+' | Last seen '+fmtT(d.last)+' | Commands used '+d.cmdTotal+' | Number hash '+(d.hasNumberHash?'sent':'not sent');box.append(p);if((d.flags||[]).length||d.directive){const f=document.createElement('div');f.style.cssText='margin-top:6px;font-size:13px;color:#fb7185';f.textContent=((d.flags||[]).length?'Flags: '+d.flags.map(x=>x.k+' x'+x.n).join(', ')+'. ':'')+(d.directive?'Directive: '+d.directive.act+(d.directive.lim?' ('+d.directive.lim+'/min)':'')+' until '+fmtT(d.directive.until)+'.':'');box.append(f)}const q=document.createElement('div');q.style.cssText='margin-top:6px;font-size:13px';q.textContent='Top: '+(d.top.length?d.top.map(x=>'/'+x[0]+' '+x[1]).join(', '):'none yet');box.append(q)}catch{box.textContent='Could not load details.'}});
$('e-find').addEventListener('click',async()=>{const o=$('e-res');o.textContent='Checking...';try{const r=await fetch(new URL('api/lookup',base).href,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({number:$('e-num').value})});if(r.status===429){o.textContent='Too many lookups, wait a minute.';return}if(!r.ok)throw 0;const j=await r.json();$('e-num').value='';o.textContent=!j.valid?'Enter a full number with country code.':j.matches.length?'Known install: '+j.matches.map(m=>m.sid+(m.owner?' (owner)':'')+' v'+m.ver).join(', '):'No install with that number has reported in.'}catch{o.textContent='Lookup failed.'}});
const oask=async()=>{const a=$('o-a');const q=$('o-q').value.trim();if(!q)return;a.hidden=false;a.textContent='Thinking...';try{const r=await fetch(new URL('api/assistant',base).href,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({q})});const j=await r.json();a.textContent=j.text||'No answer.'}catch{a.textContent='Could not reach the assistant.'}};
$('o-go').addEventListener('click',oask);$('o-q').addEventListener('keydown',e=>{if(e.key==='Enter')oask()});
async function fpoll(){try{const r=await fetch(new URL('api/feedback',base).href,{cache:'no-store',credentials:'same-origin'});if(!r.ok)return;const j=await r.json();const ul=$('fb-list');ul.textContent='';$('fb-h').textContent='Feedback'+(j.items.length?' ('+j.items.length+')':'');if(!j.items.length){const li=document.createElement('li');li.textContent='No feedback yet.';ul.append(li)}j.items.forEach(f=>{const li=document.createElement('li');li.style.cssText='white-space:normal;line-height:1.5';const h=document.createElement('b');h.textContent=f.sid+' v'+f.ver+'  ';const m=document.createElement('span');m.style.color='var(--mu)';m.textContent=fmtT(f.t);const b=document.createElement('div');b.textContent=f.text;li.append(h,m,b);ul.append(li)})}catch{}}
async function epoll(){if(!document.hidden){try{const r=await fetch(EAPI,{cache:'no-store',credentials:'same-origin'});if(r.ok)eco(await r.json())}catch{}}}
epoll();setInterval(epoll,10000);fpoll();setInterval(fpoll,15000);up=Number($('up').dataset.s||0);upAt=Date.now();clock();setInterval(clock,1000);poll()})();
`;
const ico = {wa: '💬', up: '⏱️', ram: '🧠', cpu: '⚡', cmd: '🚀', dl: '📥', fail: '⚠️', plug: '🧩', disk: '💾'};
export function page(s, nonce = '') {
  const top = (s.usage || []).slice(0, 10); const mx = Math.max(1, ...top.map((x) => x[1]));
  const bars = top.map(([n, c], i) => `<div class="bar" style="--w:${(c / mx * 100).toFixed(0)}%;animation-delay:${i * 40}ms"><span>/${esc(n)}</span><strong>${c}</strong></div>`).join('');
  const recent = (s.recent || []).slice().sort((a, b) => (Number(b && b.at) || 0) - (Number(a && a.at) || 0)).slice(0, 8).map((r) => { const n = typeof r === 'string' ? r : String((r && r.name) || '?'); const at = typeof r === 'object' && r ? Number(r.at) || 0 : 0; const who = typeof r === 'object' && r && r.who ? `<span class="who">by ${esc(String(r.who).slice(0, 24))}</span>` : ''; return `<li class="act"><span class="cmd">/${esc(n.replace(/^\//, '').slice(0, 40))}${who}</span><span class="tm"${at ? ` data-at="${at}"` : ''}></span></li>`; }).join('');
  const rp = s.ramLimit ? s.ramUsed / s.ramLimit : 0;
  const ring = (id, p) => `<svg class="ring" viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="42"/><circle class="v" id="${id}" cx="50" cy="50" r="42" style="stroke-dashoffset:${(263.9 * (1 - Math.max(0, Math.min(1, p)))).toFixed(1)}px"/></svg>`;
  const sp = (id) => `<svg class="spark" id="${id}" viewBox="0 0 100 30" preserveAspectRatio="none"><path d=""/><polyline points=""/></svg>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#060b16"><title>${esc(s.botName)} dashboard</title><style>${CSS}</style></head><body>
<div class="bg"><i></i><i></i><i></i></div>
<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs></svg>
<div class="wrap"><header><div><h1>${esc(s.botName)} dashboard</h1><span class="pill${s.wa === 'online' ? '' : ' off'}" id="pill"><i class="dot"></i>${ico.wa} WhatsApp: <span id="wa">${esc(s.wa)}</span></span></div>
<div class="clock"><b id="time">--:--:--</b><small id="date"></small></div></header>
<div class="grid">
<div class="card span2"><small>${ico.ram} RAM</small><div class="gauge">${ring('ramr', rp)}<div><b id="ramv">${mb(s.ramUsed)}</b><em id="raml">of ${mb(s.ramLimit)} (${Math.round(rp * 100)}%)</em></div></div>${sp('rams')}</div>
<div class="card span2"><small>${ico.cpu} CPU</small><div class="gauge">${ring('cpur', s.cpuPct / 100)}<div><b id="cpuv">${s.cpuPct}%</b><em>live load</em></div></div>${sp('cpus')}</div>
<div class="card"><small>${ico.up} Uptime</small><b id="up" data-s="${s.uptimeSec}" style="font-size:clamp(18px,5vw,24px)">${dur(s.uptimeSec)}</b></div>
<div class="card"><small>${ico.cmd} Commands run</small><b id="cmds" data-v="${s.totalCommands}">${s.totalCommands}</b></div>
<div class="card"><small>${ico.dl} Downloads</small><b id="dl" data-v="${s.downloads}">${s.downloads}</b></div>
<div class="card"><small>${ico.fail} Failures</small><b id="fail" data-v="${s.failures}"${s.failures > 0 ? ' class="bad"' : ''}>${s.failures}</b></div>
<div class="card"><small>${ico.plug} Commands loaded</small><b id="plug" data-v="${s.plugins}">${s.plugins}</b></div>
<div class="card"><small>${ico.disk} Disk free</small><b id="disk">${mb(s.diskFree)}</b></div>
</div>
<h3>Top commands</h3><div class="bars" id="top">${bars}</div>
<h3>Recent activity</h3><ul class="rec" id="rec">${recent}</ul>
<section id="eco" hidden><h3>Ecosystem</h3>
<div class="grid"><div class="card"><small>🌍 Installs</small><b id="e-total">-</b></div><div class="card"><small>📅 Active 7 days</small><b id="e-7d">-</b></div><div class="card"><small>🔥 Active 24h</small><b id="e-24h">-</b></div><div class="card"><small>🟢 Online now</small><b id="e-on">-</b></div>
<div class="card"><small>⭐ Stars</small><b id="g-s">-</b></div><div class="card"><small>🍴 Forks</small><b id="g-f">-</b></div><div class="card"><small>👀 Watchers</small><b id="g-w">-</b></div><div class="card"><small>⏱️ Median uptime</small><b id="e-up" style="font-size:clamp(18px,5vw,24px)">-</b></div></div>
<h3>Top commands (all installs)</h3><div class="bars" id="e-top"></div>
<h3>Installs</h3><ul class="rec" id="e-list"></ul><div id="e-detail" class="card" hidden style="margin-top:10px"></div>
<h3 id="fb-h">Feedback</h3><ul class="rec fb" id="fb-list"></ul>
<h3>Number lookup</h3><p style="color:var(--mu);font-size:12px;margin:0 0 8px">Check if a number belongs to a known install. The number is hashed on the server, compared and never stored.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="e-num" inputmode="numeric" autocomplete="off" placeholder="Number with country code" style="flex:1;min-width:180px;padding:10px;border-radius:10px;border:1px solid #2a3350;background:#0d1224;color:#e8ecff"><button id="e-find" style="padding:10px 16px;border-radius:10px;border:0;background:#6c8cff;color:#fff;font-weight:600;cursor:pointer">Look up</button></div><p id="e-res" style="color:var(--mu);font-size:13px"></p><p style="color:var(--mu);font-size:12px" id="e-ver"></p><p style="color:var(--mu);font-size:11px;word-break:break-all" id="e-key"></p></section>
<section id="ops"><h3>Ask Tab</h3><p style="color:var(--mu);font-size:12px;margin:0 0 8px">Read-only assistant. It answers from the numbers on this page, never sees phone numbers or chats, and cannot change anything.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="o-q" maxlength="300" autocomplete="off" placeholder="e.g. Which command is used most?" style="flex:1;min-width:180px;padding:10px;border-radius:10px;border:1px solid #2a3350;background:#0d1224;color:#e8ecff"><button id="o-go" style="padding:10px 16px;border-radius:10px;border:0;background:#6c8cff;color:#fff;font-weight:600;cursor:pointer">Ask</button></div><div id="o-a" class="card" hidden style="margin-top:10px;white-space:pre-wrap;font-size:14px;animation:none"></div></section>
<footer><span id="live">Live, every 1s</span><span>Last update <b id="seen">-</b> IST. Read-only.</span></footer></div>
<script${nonce ? ` nonce="${nonce}"` : ''}>${JS}</script></body></html>`;
}
