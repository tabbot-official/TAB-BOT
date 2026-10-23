// Tab: many replies were written for Jarvis' "/" prefix ("Answer: /riddle answer TEXT", "Use /menu").
// With another prefix (Tab uses ".") a user who copies "/riddle ..." gets no answer, because only the prefix
// starts a command. Rewrite "/<command>" to the live prefix in bot replies, for known command names only.
// A "/" inside a URL or path is preceded by a word character or another "/" and is left alone.
const RE = /(^|[\s(\[{*_~"'`>:,;|])\/([a-z][a-z0-9_]{1,29})(?=$|[^a-z0-9_/])/gim;

export function localizePrefix(text, prefix, isCommand) {
  if (typeof text !== 'string' || !text.includes('/') || !prefix || prefix === '/') return text;
  return text.replace(RE, (m, pre, name) => (isCommand(name.toLowerCase()) ? pre + prefix + name : m));
}
