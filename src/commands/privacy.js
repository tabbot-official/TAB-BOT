// PRIVACY: view and set the bot account's WhatsApp privacy settings. Owner only.
import { featOn } from '../config/features.js';

const MAP = {
  lastseen: { get: 'last', set: 'updateLastSeenPrivacy', vals: ['all', 'contacts', 'contact_blacklist', 'none'] },
  online: { get: 'online', set: 'updateOnlinePrivacy', vals: ['all', 'match_last_seen'] },
  profilepic: { get: 'profile', set: 'updateProfilePicturePrivacy', vals: ['all', 'contacts', 'contact_blacklist', 'none'] },
  status: { get: 'status', set: 'updateStatusPrivacy', vals: ['all', 'contacts', 'contact_blacklist', 'none'] },
  readreceipts: { get: 'readreceipts', set: 'updateReadReceipts', vals: ['all', 'none'] },
  groupsadd: { get: 'groupadd', set: 'updateGroupsAddPrivacy', vals: ['all', 'contacts', 'contact_blacklist', 'none'] },
};

export default {
  name: 'privacy', aliases: ['waprivacy'], category: 'Owner',
  description: 'View or change the bot account privacy settings',
  usage: 'privacy | privacy <lastseen|online|profilepic|status|readreceipts|groupsadd> <value>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('privacy')) return ctx.reply('Privacy controls are turned off right now.');
    const [k, v] = ctx.args.map((x) => (x || '').toLowerCase());
    const current = await ctx.sock.fetchPrivacySettings(true).catch(() => null);
    const show = async () => {
      if (!current) return ctx.reply('Could not read the current settings.');
      return ctx.reply('*Bot privacy now:*\n• last seen: ' + current.last + '\n• online: ' + current.online + '\n• profile pic: ' + current.profile + '\n• status: ' + current.status + '\n• read receipts: ' + current.readreceipts + '\n• group adds: ' + current.groupadd);
    };
    if (!k) return show();
    const item = MAP[k];
    if (!item) return ctx.reply('Unknown setting "' + k + '". Try: ' + Object.keys(MAP).join(', '));
    if (!v) return ctx.reply('*' + k + '* is now: ' + (current?.[item.get] || 'unknown') + '\nOptions: ' + item.vals.join(', '));
    if (!item.vals.includes(v)) return ctx.reply('Invalid value for ' + k + '. Options: ' + item.vals.join(', '));
    const before = current?.[item.get] || 'unknown';
    await ctx.sock[item.set](v);
    return ctx.reply('✅ *' + k + '* changed: ' + before + ' → ' + v);
  },
};
