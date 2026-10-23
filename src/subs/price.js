// Free price sources: CoinGecko (crypto, no key) and Stooq CSV (stocks, no key).
const COINS={btc:'bitcoin',eth:'ethereum',sol:'solana',doge:'dogecoin',bnb:'binancecoin',xrp:'ripple',ada:'cardano',usdt:'tether'};
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'JarvisBot/1.0'}});if(!r.ok)throw Error('source '+r.status);return r.text();}
export async function priceOf(asset){
 const a=String(asset||'').trim().toLowerCase();
 if(COINS[a]){
  const t=await get('https://api.coingecko.com/api/v3/simple/price?ids='+COINS[a]+'&vs_currencies=usd,inr');
  const j=JSON.parse(t);const row=j[COINS[a]];if(!row)throw Error('coin not found');
  return {name:a.toUpperCase(),usd:row.usd,inr:row.inr};
 }
 // stock via stooq: allow RELIANCE.NS, ^NSEI, AAPL.US etc.
 const sym=a.includes('.')?a:a+'.ns';
 const csv=await get('https://stooq.com/q/l/?s='+encodeURIComponent(sym)+'&f=sd2t2ohlcv&h&e=csv');
 const line=csv.trim().split('\n')[1];if(!line)throw Error('symbol not found');
 const cols=line.split(',');const close=Number(cols[6]);
 if(!Number.isFinite(close))throw Error('symbol not found');
 return {name:cols[0],price:close,currency:sym.endsWith('.ns')?'INR':'USD'};
}
export function hit(job,price){
 if(!Number.isFinite(price))return false;
 return job.dir==='above'?price>=job.target:price<=job.target;
}
