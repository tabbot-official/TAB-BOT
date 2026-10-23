import {rt,RuntimeInputError} from '../i18n/runtime.js';
import {failure,errorCode} from './index.js';import {t} from '../i18n/index.js';import logger from '../utils/logger.js';
/** Call after a failed operation; never retries effects and never exposes raw messages. */
export async function replyFailure(ctx,command,err){const f=failure(command,err);logger.warn(`Command ${/^[a-z0-9_]{1,30}$/.test(String(command))?command:'unknown'} reference ${f.id}, class ${f.kind}, code ${errorCode(err)}`);await ctx.reply(t(ctx,'error',{message:err instanceof RuntimeInputError?rt(ctx,err.key,err.values):t(ctx,'error_'+f.kind),id:f.id})).catch(()=>{});return f;}
