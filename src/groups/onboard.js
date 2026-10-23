// Short intro the first time the bot is added to a group. Sent once per group.
export function introText(prefix = '/', botName = 'Tab') {
  return [
    `👋 Hi, I'm *${botName}*, a WhatsApp assistant.`,
    `Send *${prefix}menu* to see everything I can do, or *${prefix}help* to learn how to use me.`,
    `Try *${prefix}ping* to check that I'm awake.`,
    '',
    `_Group admins: make me an admin if you want me to help moderate. I only reply to messages that start with ${prefix}. Admin tools like anti-link stay off until an admin turns them on._`,
  ].join('\n');
}
export function botWasAdded(ids, meNums, num) {
  const mine = new Set(meNums);
  return ids.some((i) => mine.has(num(i)));
}
