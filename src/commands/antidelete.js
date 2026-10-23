import { getSettings, setSetting, stats } from '../recover/store.js';
import { quiet } from '../recover/index.js';

const KEYS = { on: 'antidelete', off: 'antidelete', groups: 'groups', status: 'status', vo: 'vo' };
const onoff = (v) => (v ? 'ON' : 'OFF');

export default {
  name: 'antidelete',
  aliases: ['antidel'],
  category: 'Recover',
  description: 'Recover deleted messages and statuses (sent to your own chat)',
  usage: 'antidelete [on|off|groups on|off|status on|off|vo on|off]',
  ownerOnly: true,
  async run(ctx) {
    const to = await quiet(ctx);
    const a = ctx.args.map((x) => x.toLowerCase());
    if (a[0] === 'on' || a[0] === 'off') setSetting('antidelete', a[0] === 'on');
    else if (['groups', 'status', 'vo'].includes(a[0]) && ['on', 'off'].includes(a[1])) setSetting(KEYS[a[0]], a[1] === 'on');
    const s = getSettings();
    const st = stats();
    await ctx.sock.sendMessage(to, {
      text: `Recover settings\n\nDeleted chat messages: ${onoff(s.antidelete)}\nGroup chats too: ${onoff(s.groups)}\nSave statuses: ${onoff(s.status)}\nSave view-once: ${onoff(s.vo)}\n\nSaved now: ${st.entries} items, ${(st.bytes / 1048576).toFixed(1)} MB\nOnly items that arrive after these are ON can be recovered.\n\nChange: /antidelete on|off, /antidelete groups on, /antidelete status off, /antidelete vo off`,
    });
  },
};
