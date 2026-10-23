import { recoverViewOnce } from './_vo.js';

export default {
  name: 'vvn',
  aliases: ['vvvoice'],
  category: 'Recover',
  description: 'Recover a view-once voice note',
  usage: 'vvn (reply to it, or latest saved)',
  ownerOnly: true,
  run: (ctx) => recoverViewOnce(ctx, ['audio'], 'view-once voice note'),
};
