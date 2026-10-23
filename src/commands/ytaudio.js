import { runDownloadCommand } from './_download.js';

export default {
  name: 'play',
  aliases: ['ytaudio', 'ytmp3', 'song'],
  category: 'Downloaders',
  description: 'Download the audio of a YouTube video (M4A)',
  usage: 'play <name or link>',
  minArgs: 1,
  async run(ctx) {
    await runDownloadCommand(ctx, { expect: 'youtube', kind: 'audio', label: 'audio' });
  },
};
