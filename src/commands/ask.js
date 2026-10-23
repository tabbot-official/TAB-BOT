import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { askAi, askAll, synthesizeAnswers, PROVIDERS } from '../ai/providers.js';
import logger from '../utils/logger.js';
import { recall, remember, forget, withContext } from '../ai/chatMemory.js';
import { userMemory } from '../ops/index.js';
import { featOn } from '../config/features.js';
import { decideSearch, webContext, shortUrl } from '../ai/websearch.js';

const MAX_CHARS = 3500;

// Accuracy rules for /ask answers (appended to the shared system prompt only for this command).
const ASK_ACCURACY = 'Accuracy rules: never invent facts, prices, scores, dates or names - agar pakka nahi pata toh honestly bolo "pakka nahi pata" ya "not sure". ' +
  'Do the math step by step and be exact for calculations. For date/time questions reason from the current IST time given above. ' +
  'For follow-ups like "aur batao", "uska", "ye kya hai", use the conversation history. Keep the same Hinglish/English style as the user.';

export default {
  name: 'ask',
  aliases: ['ai'],
  category: 'AI',
  description: 'Ask an AI anything (auto-searches the web when needed)',
  usage: 'ask <question>',
  minArgs: 1,
  async run(ctx) {
    let args = [...ctx.args];
    let prefer;
    // "/ask groq: question" or "/ask gemini question" picks a provider.
    const first = (args[0] || '').toLowerCase().replace(/:$/, '');
    const hit = PROVIDERS.find((p) => p.id === first || p.label.toLowerCase().startsWith(first));
    if (hit && args.length > 1 && first === hit.id) {
      prefer = hit.id;
      args = args.slice(1);
    }
    const question = args.join(' ').trim();
    const who = String(ctx.senderJid || ctx.sender || '');
    if (/^(reset|clear|new)$/i.test(question)) { forget(ctx.jid, who); return ctx.reply('🧹 Conversation cleared. Ask something new.'); }
    if (!question) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'ask <question>'}));
    const live = await ctx.reply('💭 Thinking...').catch(() => null);
    let shown = '';
    const show = async (text) => {
      if (text === shown) return; shown = text;
      if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text, edit: live.key }); return true; } catch { /* fall through */ } }
      return false;
    };
    try {
      const q = question.slice(0, 2000);
      let web = null;
      const decision = await decideSearch(q);
      logger.info(`[ask] web decision: ${decision.search} (${decision.via})`);
      if (decision.search && process.env.ASK_WEB !== 'off') {
        await show('💭 Searching the web...');
        try { web = await webContext(q); } catch (e) { logger.warn(`[ask] web search failed: ${e.message}`); web = null; }
      }
      const askOpts = () => ({ prefer, history: recall(ctx.jid, who), allowKeyless: true, temperature: 0.4, systemSuffix: ASK_ACCURACY + (featOn('memory') ? userMemory.suffix(who) : ''), onStatus: (m) => show('💭 ' + m) });
      const qWithCtx = web ? `${q}\n\n${web.contextText}` : q;
      let r;
      try {
        if (prefer || process.env.ASK_MERGE === 'off') {
          r = await askAi(qWithCtx, askOpts());
        } else {
          // Multi-AI merge: free providers answer in parallel, a free synthesizer merges them. Gemini stays in reserve for its 20/day quota.
          await show('💭 Asking multiple AIs...');
          const answers = await askAll(qWithCtx, { history: recall(ctx.jid, who), temperature: 0.4, systemSuffix: ASK_ACCURACY + (featOn('memory') ? userMemory.suffix(who) : ''), exclude: ['gemini'] });
          if (!answers.length) {
            r = await askAi(qWithCtx, askOpts());
          } else {
            if (answers.length >= 2) await show('💭 Merging answers...');
            r = await synthesizeAnswers(q, answers, { systemSuffix: ASK_ACCURACY + (featOn('memory') ? userMemory.suffix(who) : '') });
          }
        }
      } catch (err) {
        // Graceful quota fallback: if AI providers are all busy but we have web results, still answer with sources.
        if (web?.sources?.length) {
          const list = web.sources.slice(0, 3).map((x, i) => `${i + 1}. ${x.title}\n${shortUrl(x.url)}`).join('\n');
          const msg = `⚠️ AI abhi busy hai, par web pe ye mila:\n\n${list}`;
          if (!(await show(msg))) await ctx.reply(msg);
          return;
        }
        throw err;
      }
      // If the AI says it lacks current data and we did not search yet, retry once with web results.
      if (!web && process.env.ASK_WEB_RETRY !== 'off' && /(real[- ]?time|latest (information|data|update)|current information|can'?t browse|cannot browse|don'?t have access to (the )?(internet|web|live)|mere paas (latest|abhi)|jaankari (nahi|nhi) hai|up[- ]?to[- ]?date (info|data))/i.test(r.text)) {
        try { web = await webContext(q); } catch { web = null; }
        if (web?.contextText) {
          await show('💭 Searching the web...');
          try { r = await askAi(`${q}\n\n${web.contextText}`, askOpts()); } catch { /* keep the first answer */ }
        }
      }
      remember(ctx.jid, who, q, r.text);
      let text = r.text.length > MAX_CHARS ? `${r.text.slice(0, MAX_CHARS)}…` : r.text;
      if (web?.sources?.length) text += `\n\n*Sources:*\n` + web.sources.slice(0, 2).map((x) => `- ${shortUrl(x.url)}`).join('\n');
      const out = `${text}\n\n_via ${r.provider} - reply with /ask again for a follow-up, /ask reset to clear_`;
      if (!(await show(out))) await ctx.reply(out);
    } catch (err) {
      if (live?.key) await show('⚠️ Could not get an answer.').catch(() => {});
      await replyFailure(ctx,'ask',err);
    }
  },
};
