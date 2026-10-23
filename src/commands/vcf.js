// VCF: build a contact card (.vcf) and send it as a document.
import config from '../config/config.js';
import { featOn } from '../config/features.js';

export default {
  name: 'vcf', aliases: ['contact', 'makecontact'], category: 'Tools',
  description: 'Make a shareable contact card (.vcf)',
  usage: 'vcf <name> <number> [number2...]',
  async run(ctx) {
    if (!featOn('vcf')) return ctx.reply('Contact cards are turned off right now.');
    const [name, ...nums] = ctx.args;
    const phones = nums.map((n) => n.replace(/[^\d+]/g, '')).filter((n) => n.length >= 7 && n.length <= 16);
    if (!name || !phones.length) return ctx.reply('Use: ' + config.prefix + 'vcf <name> <number> [more numbers] - example: ' + config.prefix + 'vcf Rahul 919876543210');
    const safe = name.replace(/[\r\n:;,]/g, ' ').slice(0, 60);
    const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + safe, 'N:' + safe + ';;;', ...phones.map((p, i) => 'TEL;TYPE=' + (i ? 'WORK' : 'CELL') + ':' + p), 'END:VCARD'].join('\r\n');
    await ctx.sock.sendMessage(ctx.jid, {
      document: Buffer.from(vcf, 'utf8'),
      mimetype: 'text/vcard',
      fileName: safe.replace(/\s+/g, '_') + '.vcf',
      caption: '📇 ' + safe + ' - ' + phones.join(', '),
    }, { quoted: ctx.msg });
  },
};
