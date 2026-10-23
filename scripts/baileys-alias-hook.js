// Tab: module resolve hook registered by scripts/runner.js when BAILEYS_PKG names another Baileys build
// (for example @innovatorssoft/baileys). Every `import ... from '@whiskeysockets/baileys'` in the bot then
// loads that package instead, so all features keep using one library.
let target = '';
export async function initialize(data) { target = String(data?.pkg || '').trim(); }
export async function resolve(specifier, context, next) {
  if (target && (specifier === '@whiskeysockets/baileys' || specifier.startsWith('@whiskeysockets/baileys/'))) {
    return next(target + specifier.slice('@whiskeysockets/baileys'.length), context);
  }
  return next(specifier, context);
}
