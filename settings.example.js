// Copy this file to settings.js and fill it in. settings.js stays on your server and is not committed.
// Put secrets (API keys, tokens) in .env, never here.
export default {
  owner: {
    name: 'Your Name',
    number: '919876543210', // digits only, country code first, no +
    timezone: 'Asia/Kolkata',
    language: 'en',
  },
  bot: {
    name: 'Tab',        // overrides BOT_NAME in .env when set
    autoStatusView: null,  // true / false, or null to use .env
    allowGroups: null,     // true / false, or null to use .env
    ownerOnly: null,       // true / false, or null to use .env
  },
  // Owner login: when the owner runs an owner-only command without being logged in, the bot
  // sends a one-time code to the owner's own chat. Send "/login <code>" to unlock.
  auth: {
    enabled: true,
    lockOwnerCommands: true, // false = owner commands never ask for a login
    codeLength: 6,
    codeExpiryMinutes: 5,
    sessionHours: 12,
    maxAttempts: 5,
    exemptCommands: ['login', 'logout', 'menu', 'help', 'status', 'ping', 'checksudo'],
  },
  // Feature switches by command category. false = those commands are off for everyone.
  features: {
    ai: true, downloaders: true, image: true, games: true, economy: true, utilities: true,
    books: true, group: true, recover: true, whatsapp: true, tools: true, language: true,
  },
  // Pairing portal identity. Leave empty until you pair through the portal.
  // sid: the S-ID the portal sent to your WhatsApp "Message yourself" chat. number: the WhatsApp number you paired (digits only).
  ecosystem: {
    sid: '',
    number: '',
    // autoPair: true collects the WhatsApp session the pairing website prepared for you (so you link only once). Set false to link here instead.
    // autoPair: true,
  },
  // Turn off single commands by name, e.g. ['truecaller', 'remini'].
  disabledCommands: [],
};
