import { readCrashes, crashText } from '../ops/crashlog.js';
export default {
  name: 'crashes', aliases: ['crashlog'], category: 'System', ownerOnly: true,
  description: 'Owner: recent crashes and restarts', usage: 'crashes', minArgs: 0,
  async run(ctx) { return ctx.reply(crashText(readCrashes())); },
};
