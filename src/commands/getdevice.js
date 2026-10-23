// GETDEVICE: best-effort guess of the device a message was sent from, using the message ID prefix.
import config from '../config/config.js';
import { featOn } from '../config/features.js';

export default {
  name: 'getdevice', aliases: ['device'], category: 'Tools',
  description: 'Guess which device a message came from (reply to a message)',
  usage: 'getdevice (reply to a message)',
  async run(ctx) {
    if (!featOn('getdevice')) return ctx.reply('Device check is turned off right now.');
    const q = ctx.msg.message?.extendedTextMessage?.contextInfo;
    const id = q?.stanzaId || ctx.msg.key.id;
    let d = 'Android or unknown';
    if (/^3A/.test(id)) d = 'iOS (iPhone)';
    else if (/^3EB0/.test(id)) d = 'WhatsApp Web';
    else if (/^3E8|^3EF/.test(id)) d = 'Desktop app';
    else if (/^BAE5/.test(id)) d = 'Android';
    else if (/^[A-Z0-9]{20,}$/.test(id) && !/^3/.test(id)) d = 'Modern multi-device (cannot tell exactly)';
    return ctx.reply('📱 Best guess: *' + d + '*\n(message ids only hint at the device - not always exact)');
  },
};
