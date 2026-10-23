const bounded=(key,fallback,min,max)=>{const n=Number(process.env[key]);return Number.isFinite(n)&&n>=min&&n<=max?Math.floor(n):fallback;};
export const gameConfig={maxSessions:bounded('GAME_MAX_SESSIONS',100,1,500),inviteMs:bounded('GAME_INVITE_SECONDS',60,15,300)*1000,turnMs:bounded('GAME_TURN_SECONDS',45,10,300)*1000,questionMs:bounded('GAME_QUESTION_SECONDS',60,10,300)*1000,cooldownMs:bounded('GAME_COOLDOWN_SECONDS',3,1,60)*1000,maxPlayers:bounded('GAME_MAX_PLAYERS',8,2,16)};
export const levels=['easy','medium','hard'];
export function difficulty(value='easy'){if(!levels.includes(value))throw new Error('Choose easy, medium or hard.');return value;}
