import { recoverViewOnce } from './_vo.js';

export default {
  name: 'vv',
  aliases: ['viewonce'],
  category: 'Recover',
  description: 'Recover a view-once photo or video',
  usage: 'vv (reply to it, or latest saved)',
  ownerOnly: true,
  run: (ctx) => recoverViewOnce(ctx, ['image', 'video'], 'view-once photo or video'),
};
