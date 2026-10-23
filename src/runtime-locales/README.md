# Shared runtime text

This dictionary is separate from src/locales, the core menu, permission and recovery schema.
Missing runtime files fall back to English per key. A complete core dictionary does not imply a complete runtime dictionary.

English schema: 228 keys. Joke, fact and quiz corpora remain English. User-supplied text, rules, reasons, words, names, URLs and quotes stay unchanged.

To import reviewed worker output:

    python3 scripts/import-runtime-locales.py /downloads/hin-runtime.json
    python3 scripts/audit-runtime-locales.py
    npm test

The schema checks exact keys, named placeholders and literal /commands. They do not certify linguistic accuracy. Technical tokens that users must type, including on/off/reset/confirm and category/setting codes, must stay usable.

A full manual deployment must install the new stable runner before automatic updates can use locale JSON changes. That runner is intentionally never auto-updated.
