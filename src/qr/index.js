import QRCode from 'qrcode';
const COLORS={black:'#000000',red:'#c0262d',blue:'#1a4fc4',green:'#13803a',purple:'#6a2fb5',orange:'#d35f0a',pink:'#c2287b',teal:'#0f7c7c'};
const wesc=s=>String(s).replace(/([\\;,:"])/g,'\\$1');
export function parseQrArgs(args){
 let a=[...args];const o={};
 if(a[0]&&/^wifi$/i.test(a[0])){const [,ssid,pass,type]=a;if(!ssid)throw new Error('Usage: /qr wifi <name> [password] [WPA|WEP|nopass]');const t=!pass?'nopass':(/^(wep|nopass)$/i.test(type||'')?type.toUpperCase().replace('NOPASS','nopass'):'WPA');return {text:`WIFI:T:${t};S:${wesc(ssid)};${pass?`P:${wesc(pass)};`:''};`,opts:o};}
 while(a.length>1){const w=a[0].toLowerCase();if(COLORS[w]){o.color=COLORS[w];a.shift();}else if(/^size=\d+$/.test(w)){o.width=Math.min(1600,Math.max(256,Number(w.slice(5))));a.shift();}else break;}
 return {text:a.join(' '),opts:o};
}
export async function generateQR(text,opts={}){
 if(typeof text!=='string'||!text.trim())throw new Error('Usage: /qr <text or URL>');
 if(Buffer.byteLength(text,'utf8')>2000)throw new Error('QR data is too long. Use at most 2000 UTF-8 bytes.');
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))throw new Error('QR data contains unsupported control characters.');
 try{return await QRCode.toBuffer(text,{type:'png',width:opts.width||1024,margin:4,errorCorrectionLevel:'M',color:{dark:opts.color||'#000000',light:'#ffffff'}});}catch{throw new Error('Could not generate this QR code. Try shorter text.');}
}
