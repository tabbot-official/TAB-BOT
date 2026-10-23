import config from '../config/config.js';
import { fetchPublic } from '../utilities/validation.js';
import logger from '../utils/logger.js';
import { parseNumber, searchLinks, carrierNote } from '../services/numberLookup.js';
import { lookupPhone, formatPhoneInfo, phoneStatus, PhoneInfoError } from '../services/phoneInfo.js';

export default {
  name: 'number',
  aliases: ['numinfo', 'truecaller', 'phoneinfo'],
  category: 'Tools',
  ownerOnly: true,
  description: 'Phone number lookup: validity, country, type, WhatsApp, photo, search links',
  usage: 'number +919876543210 [yes]  (yes = also use keyed online providers)',
  minArgs: 1,
  async run(ctx) {
    if (!ctx.isOwner || ctx.isGroup) return ctx.reply('Number lookup is owner-only and works in private chat only.');
    const args = ctx.args.filter((a) => a.toLowerCase() !== 'yes');
    const useApis = ctx.args.length !== args.length;
    if (args[0]?.toLowerCase() === 'status') {
      const st = await phoneStatus().catch(() => []);
      return ctx.reply(['Online providers:', ...st.map((s) => `${s.provider}: ${s.enabled ? 'configured' : 'off'}`)].join('\n'));
    }
    const info = parseNumber(args.join(' '));
    if (!info) return ctx.reply(`Send a number with country code, e.g. ${config.prefix}number +919876543210`);
    const out = [`${info.flag} *${info.international}*`];
    out.push(info.valid ? '✅ Valid number' : info.possible ? '⚠️ Format possible but not a valid number' : '❌ Not a valid number');
    if (info.countryName) out.push(`Country: ${info.countryName} (+${info.callingCode})`);
    if (info.type) out.push(`Line type: ${info.type}`);
    const note = carrierNote(info); if (note) out.push(`_${note}_`);

    // Layer 2: WhatsApp presence, about text and full-res photo
    let photo = null;
    if (info.possible) {
      const jid = `${info.e164.replace('+', '')}@s.whatsapp.net`;
      try {
        const r = await ctx.sock.onWhatsApp(jid);
        if (r?.[0]?.exists) {
          out.push('', '🟢 On WhatsApp');
          const j = r[0].jid || jid;
          try { const st = await ctx.sock.fetchStatus(j); const about = st?.status?.status ?? st?.status ?? st?.[0]?.status?.status; if (about && typeof about === 'string') out.push(`About: ${about.slice(0, 200)}`); } catch { out.push('About: hidden or empty'); }
          try { const u = await ctx.sock.profilePictureUrl(j, 'image', 15000); if (u) { const res = await fetchPublic(u, { maxBytes: 8 * 1024 * 1024, timeoutMs: 20000 }); if (res.status === 200) photo = res.body; } } catch { /* no photo */ }
          out.push(photo ? 'Profile photo: below' : 'Profile photo: none or hidden');
        } else out.push('', '⚪ Not on WhatsApp');
      } catch (e) { logger.info('[number] whatsapp check failed'); out.push('', 'WhatsApp check unavailable right now.'); }
    }

    // Layer 4: keyed online providers, only when asked and configured
    const st = await phoneStatus().catch(() => []);
    const keyed = st.filter((s) => s.enabled);
    if (useApis && keyed.length) {
      try { const r = await lookupPhone(info.e164, { allowDisclosure: true }); out.push('', formatPhoneInfo(r)); }
      catch (e) { out.push('', e instanceof PhoneInfoError ? e.message : 'Online providers failed.'); }
    } else if (keyed.length) out.push('', `Online providers ready (${keyed.map((s) => s.provider).join(', ')}). Add "yes" to the command to use them (sends the number to those services).`);

    out.push('', '*Search links*', ...searchLinks(info.e164).map(([n, u]) => `• ${n}: ${u}`));
    const text = out.join('\n');
    if (photo) await ctx.sock.sendMessage(ctx.jid, { image: photo, caption: text.slice(0, 1000) }, { quoted: ctx.msg });
    if (!photo || text.length > 1000) await ctx.reply(text);
  },
};
