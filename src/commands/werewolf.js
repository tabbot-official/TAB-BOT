// WEREWOLF: the social deduction game. Roles by DM, night actions in DM, votes in the group.
import config from '../config/config.js';
import { featOn } from '../config/features.js';
import { getGame, createGame, endGame, assignRoles, winner, tally, gameOfPlayer, joinGame } from '../fun/werewolf.js';

const num = (j) => (j || '').split('@')[0].split(':')[0];
const ROLE_INFO = {
  werewolf: '🐺 You are a WEREWOLF. Each night, DM me: /ww kill <number>. Blend in by day!',
  seer: '🔮 You are the SEER. Each night, DM me: /ww see <number> to learn their role.',
  guardian: '🛡️ You are the GUARDIAN. Each night, DM me: /ww protect <number> to shield one player from the wolves. You cannot shield the same person two nights in a row.',
  sorcerer: '🔮 You are the SORCERER, on the wolves\' side. You cannot kill, but each night DM me: /ww see <number> to learn a player\'s role. Help the wolves win without getting caught!',
  villager: '🧑 You are a VILLAGER. Find the wolves and vote them out by day!',
};
const findByNumber = (g, n) => { const clean = String(n).replace(/\D/g, ''); return g.players.find((p) => num(p) === clean) || null; };

async function dmAll(sock, g) {
  let failed = 0;
  for (const p of g.players) {
    try { await sock.sendMessage(p, { text: ROLE_INFO[g.roles[p]] }); }
    catch { failed++; }
  }
  return failed;
}

export default {
  name: 'werewolf', aliases: ['ww'], category: 'Games',
  description: 'Play Werewolf with the group (roles sent by DM)',
  usage: 'werewolf start | join | begin | status | end | day | vote <number>; in DM: ww kill/see <number>',
  async run(ctx) {
    if (!featOn('werewolf')) return ctx.reply('Werewolf is turned off right now.');
    const me = num(ctx.senderJid || ctx.sender);
    const meJ = me + '@s.whatsapp.net';
    const sub = (ctx.args[0] || 'status').toLowerCase();

    if (!ctx.isGroup) {
      const found = gameOfPlayer(meJ);
      if (!found) return ctx.reply('You are not in a running Werewolf game.');
      const { game } = found;
      if (game.state !== 'night') return ctx.reply('It is not night right now.');
      if (!game.alive.has(meJ)) return ctx.reply('You are out of this game.');
      const target = ctx.args[1] && findByNumber(game, ctx.args[1]);
      if (sub === 'kill') {
        if (game.roles[meJ] !== 'werewolf') return ctx.reply('Only werewolves hunt at night.');
        if (!target || !game.alive.has(target)) return ctx.reply('Pick a living player number. Example: /ww kill 919876543210');
        game.nightKill = target;
        return ctx.reply('🐺 Noted. The pack moves at dawn.');
      }
      if (sub === 'see') {
        if (game.roles[meJ] !== 'seer' && game.roles[meJ] !== 'sorcerer') return ctx.reply('Only the seer or the sorcerer can divine roles.');
        if (!target || !game.alive.has(target)) return ctx.reply('Pick a living player number.');
        return ctx.reply('🔮 @' + num(target) + ' is a *' + game.roles[target] + '*.');
      }
      if (sub === 'protect') {
        if (game.roles[meJ] !== 'guardian') return ctx.reply('Only the guardian can protect.');
        if (!target || !game.alive.has(target)) return ctx.reply('Pick a living player number.');
        if (target === game.lastProtect) return ctx.reply('You protected them last night. Choose someone else.');
        game.nightProtect = target;
        return ctx.reply('🛡️ Noted. You shield @' + num(target) + ' tonight.');
      }
      return ctx.reply('Night actions: /ww kill <number> (wolves), /ww see <number> (seer or sorcerer), /ww protect <number> (guardian, 7+ players).');
    }

    const game = getGame(ctx.jid);
    if (sub === 'start') {
      if (game) return ctx.reply('A game is already running here.');
      createGame(ctx.jid, meJ);
      return ctx.reply('🐺 *Werewolf lobby open!* Join: ' + config.prefix + 'ww join (4-12 players). Host begins: ' + config.prefix + 'ww begin');
    }
    if (!game) return ctx.reply('No game here. Start one: ' + config.prefix + 'ww start');
    if (sub === 'join') {
      if (game.state !== 'lobby') return ctx.reply('Already started.');
      if (game.players.includes(meJ)) return ctx.reply('You are already in.');
      if (game.players.length >= 12) return ctx.reply('Full (12 players).');
      joinGame(ctx.jid, game, meJ);
      return ctx.reply('🧑 @' + me + ' joined (' + game.players.length + ' players).', { mentions: [meJ] });
    }
    if (sub === 'begin') {
      if (game.state !== 'lobby') return ctx.reply('Already started.');
      if (num(game.players[0]) !== me && !ctx.isOwner) return ctx.reply('Only the host can begin.');
      if (game.players.length < 4) return ctx.reply('Need at least 4 players.');
      assignRoles(game);
      const failed = await dmAll(ctx.sock, game);
      return ctx.reply(`🌙 *Night ${game.round} falls.* Roles are out by DM (${game.players.length} players${failed ? ", " + failed + " could not be DM'd - they should message the bot once first" : ''}).\nWolves, the seer, the guardian (7+ players) and the sorcerer (9+ players) act in DM. When done, anyone: ` + config.prefix + 'ww day');
    }
    if (sub === 'end') {
      if (num(game.players[0]) !== me && !ctx.isOwner) return ctx.reply('Only the host (or my owner) can end it.');
      endGame(ctx.jid);
      return ctx.reply('🛑 Game ended. Roles were: ' + game.players.map((p) => '@' + num(p) + ' (' + (game.roles[p] || '?') + ')').join(', '), { mentions: game.players });
    }
    if (sub === 'status') {
      return ctx.reply(`🐺 Round ${game.round} (${game.state}). Alive: ${[...game.alive].map((p) => '@' + num(p)).join(', ')}`, { mentions: [...game.alive] });
    }
    if (sub === 'day') {
      if (game.state !== 'night') return ctx.reply('It is not night.');
      game.state = 'day';
      game.votes = {};
      let text = `☀️ *Day ${game.round}.*`;
      const saved = game.nightKill && game.nightKill === game.nightProtect;
      game.lastProtect = game.nightProtect;
      if (saved) text += ' The wolves struck, but someone was shielded. Nobody died last night.';
      else if (game.nightKill && game.alive.has(game.nightKill)) {
        game.alive.delete(game.nightKill);
        text += ` Last night @${num(game.nightKill)} was found torn apart... they were a *${game.roles[game.nightKill]}*.`;
      } else text += ' Nobody died last night.';
      game.nightKill = null; game.nightSee = null; game.nightProtect = null;
      const w = winner(game);
      if (w) { endGame(ctx.jid); return ctx.reply(text + `\n\n🏆 *${w === 'village' ? 'THE VILLAGE' : 'THE WEREWOLVES'} WIN!*`, { mentions: game.players }); }
      text += '\n\nDiscuss, then vote: ' + config.prefix + 'ww vote <number>. Alive: ' + [...game.alive].map((p) => '@' + num(p)).join(', ');
      return ctx.reply(text, { mentions: game.players });
    }
    if (sub === 'vote') {
      if (game.state !== 'day') return ctx.reply('Voting happens by day. Use ' + config.prefix + 'ww day first.');
      if (!game.alive.has(meJ)) return ctx.reply('Only the living vote.');
      const target = ctx.args[1] && findByNumber(game, ctx.args[1]);
      if (!target || !game.alive.has(target)) return ctx.reply('Pick a living player number.');
      game.votes[meJ] = target;
      if (Object.keys(game.votes).length < game.alive.size) {
        return ctx.reply(`🗳️ @${me} votes @${num(target)} (${Object.keys(game.votes).length}/${game.alive.size} votes in).`, { mentions: [meJ, target] });
      }
      const out = tally(game);
      let text;
      if (!out) text = '🗳️ Tie! Nobody is eliminated today.';
      else {
        game.alive.delete(out);
        text = `⚖️ The village has spoken: @${num(out)} is eliminated. They were a *${game.roles[out]}*.`;
      }
      const w = winner(game);
      if (w) { endGame(ctx.jid); return ctx.reply(text + `\n\n🏆 *${w === 'village' ? 'THE VILLAGE' : 'THE WEREWOLVES'} WIN!*`, { mentions: game.players }); }
      game.state = 'night'; game.round++; game.votes = {};
      return ctx.reply(text + `\n\n🌙 *Night ${game.round}.* Wolves and seer: DM me your moves.`, { mentions: game.players });
    }
    return ctx.reply('Commands: start, join, begin, day, vote <number>, status, end');
  },
};
