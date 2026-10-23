// UNO: the card game, in groups. Hands are sent by DM.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { getGame, createGame, endGame, startGame, playCard, advance, drawCards, cardText, colorEmoji, handText, playable } from '../fun/uno.js';

const num = (j) => (j || '').split('@')[0].split(':')[0];
const J = (n) => n + '@s.whatsapp.net';
const COLORWORDS = { red: 'r', green: 'g', blue: 'b', yellow: 'y', r: 'r', g: 'g', b: 'b', y: 'y' };

async function dmHand(sock, g, p, note = '') {
  const hand = g.hands[p];
  try {
    await sock.sendMessage(p, { text: `🎴 *Your UNO hand* ${note}\n${handText(hand)}\n\nTop card: ${cardText(g.discard[g.discard.length - 1])} · color ${colorEmoji(g.color)}\nPlay in the group: /uno play <card>  (e.g. /uno play r5, /uno play w red)` });
    return true;
  } catch { return false; }
}

export default {
  name: 'uno', aliases: ['unogame'], category: 'Games',
  description: 'Play UNO with the group',
  usage: 'uno start | uno join | uno begin | uno play <card> [color] | uno draw | uno table | uno end',
  async run(ctx) {
    if (!featOn('uno')) return ctx.reply('UNO is turned off right now.');
    if (!ctx.isGroup) return ctx.reply('UNO is a group game.');
    const me = num(ctx.senderJid || ctx.sender);
    const meJ = J(me);
    const sub = (ctx.args[0] || 'table').toLowerCase();
    let g = getGame(ctx.jid);

    if (sub === 'start') {
      if (g) return ctx.reply('A game is already running here. Join with ' + config.prefix + 'uno join');
      createGame(ctx.jid, meJ);
      return ctx.reply('🎴 *UNO lobby open!* Join with ' + config.prefix + 'uno join (2-8 players). Host starts with ' + config.prefix + 'uno begin');
    }
    if (!g) return ctx.reply('No game here. Start one: ' + config.prefix + 'uno start');
    if (sub === 'join') {
      if (g.state !== 'lobby') return ctx.reply('That game already started.');
      if (g.players.includes(meJ)) return ctx.reply('You are already in.');
      if (g.players.length >= 8) return ctx.reply('The game is full (8 players).');
      g.players.push(meJ);
      return ctx.sock.sendMessage(ctx.jid, { text: `✋ @${me} joined (${g.players.length} players).`, mentions: [meJ]  }, { quoted: ctx.msg });
    }
    if (sub === 'begin') {
      if (g.state !== 'lobby') return ctx.reply('Already started.');
      if (num(g.players[0]) !== me && !ctx.isOwner) return ctx.reply('Only the host can begin.');
      if (g.players.length < 2) return ctx.reply('Need at least 2 players.');
      const top = startGame(g);
      let failed = 0;
      for (const p of g.players) { if (!(await dmHand(ctx.sock, g, p))) failed++; }
      const first = g.players[g.turn];
      await ctx.reply(`🎴 *UNO begins!* First card: ${cardText(top)}\nTurn order: ${g.players.map((p) => '@' + num(p)).join(' → ')}\n\n@${num(first)} plays first.` + (failed ? `\n⚠️ ${failed} player(s) could not get their hand by DM - they should message the bot once first.` : ''), { mentions: g.players });
      return;
    }
    if (sub === 'end') {
      if (num(g.players[0]) !== me && !ctx.isOwner) return ctx.reply('Only the host (or my owner) can end it.');
      endGame(ctx.jid);
      return ctx.reply('🛑 UNO game ended.');
    }
    if (sub === 'table') {
      const top = g.discard[g.discard.length - 1];
      const cur = g.players[g.turn];
      return ctx.reply(`🎴 Top: ${cardText(top)} · color ${colorEmoji(g.color)}${g.pendingDraw ? ` · +${g.pendingDraw} pending!` : ''}\nTurn: @${num(cur)}\nCards left: ${g.players.map((p) => `@${num(p)} (${g.hands[p].length})`).join(', ')}`, { mentions: g.players });
    }
    if (g.state !== 'play') return ctx.reply('The game has not started yet.');
    if (num(g.players[g.turn]) !== me) return ctx.sock.sendMessage(ctx.jid, { text: 'Not your turn - waiting for @' + num(g.players[g.turn]) + '.', mentions: [g.players[g.turn]]  }, { quoted: ctx.msg });

    if (sub === 'draw') {
      const got = drawCards(g, meJ, Math.max(1, g.pendingDraw || 1));
      g.pendingDraw = 0;
      await dmHand(ctx.sock, g, meJ, `(you drew ${got.length})`);
      const next = advance(g);
      return ctx.sock.sendMessage(ctx.jid, { text: `🎴 @${me} drew ${got.length} card${got.length > 1 ? 's' : ''}. Next: @${num(next)}`, mentions: [meJ, next]  }, { quoted: ctx.msg });
    }
    if (sub === 'play') {
      let card = (ctx.args[1] || '').toLowerCase().replace('reverse', 'x').replace('skip', 's');
      if (card === 'wild') card = 'w';
      if (card === 'wild+4' || card === 'wd4' || card === '+4') card = 'w+4';
      if (card.length === 2 && card[0] === 'w') card = card === 'w4' ? 'w+4' : 'w';
      const chosen = COLORWORDS[(ctx.args[2] || '').toLowerCase()];
      const res = playCard(g, meJ, card, chosen);
      if (res.err) return ctx.reply('⚠️ ' + res.err);
      if (!g.hands[meJ].length) {
        endGame(ctx.jid);
        return ctx.sock.sendMessage(ctx.jid, { text: `🏆 @${me} played ${cardText(card)} and is OUT OF CARDS - *@${me} WINS UNO!* 🎉`, mentions: [meJ]  }, { quoted: ctx.msg });
      }
      let extra = 1;
      let note = '';
      if (res.skipNext) { extra = 2; note = ' (skips the next player)'; }
      const next = advance(g, extra);
      if (g.pendingDraw) note += ` - @${num(next)} must draw ${g.pendingDraw} or play on!`;
      await dmHand(ctx.sock, g, meJ, '(after your play)');
      return ctx.sock.sendMessage(ctx.jid, { text: `🎴 @${me} played ${cardText(card)}${note}${card[0] === 'w' ? ' - color is now ' + colorEmoji(g.color) : ''}\nNext: @${num(next)}${g.hands[meJ].length === 1 ? '\n\n🔥 @' + me + ' has UNO (1 card left)!' : ''}`, mentions: [meJ, next]  }, { quoted: ctx.msg });
    }
    return ctx.reply('Commands: start, join, begin, play <card> [color], draw, table, end');
  },
};
