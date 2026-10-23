import { runDownloadCommand } from './_download.js';

export default {
  name: 'video',
  aliases: ['ytvideo', 'ytmp4', 'yt'],
  category: 'Downloaders',
  description: 'Download a YouTube video (MP4)',
  usage: 'video <name or link>',
  minArgs: 1,
  async run(ctx) {
    await runDownloadCommand(ctx, { expect: 'youtube', kind: 'video', label: 'video' });
  },
};
