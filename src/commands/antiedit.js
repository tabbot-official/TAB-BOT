// ANTIEDIT: show the original when someone edits a message in a group. Owner toggle, default on.
import { getSettings, setSetting } from '../recover/store.js';
import { featOn } from '../config/features.js';

export default {
  name: 'antiedit', aliases: ['noedit'], category: 'Recover',
  description: 'Show the original text when someone edits a group message',
  usage: 'antiedit on | off',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('antiedit')) return ctx.reply('Anti-edit is turned off right now.');
    const v = (ctx.args[0] || '').toLowerCase();
    if (['on', 'off'].includes(v)) setSetting('antiedit', v === 'on');
    return ctx.reply('Anti-edit is ' + (getSettings().antiedit ? 'ON' : 'OFF') + '. Only messages received while it is on can be compared.');
  },
};
