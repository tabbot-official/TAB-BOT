// Tab: .env.example ships placeholder values (FOOTBALL_DATA_API_KEY=your-football-data-org-key, OWNER_NUMBER=91XXXXXXXXXX, ...).
// Copied into a real .env they look like keys, so a command calls the API with them and tells users the key was
// rejected instead of "not set up". Treat an untouched example value as unset.
export const PLACEHOLDER = /^(your[-_][a-z0-9_-]*|change-me[a-z0-9_-]*|91X{10}|X{8,})$/i;

export function scrubPlaceholders(env = process.env) {
  const gone = [];
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && PLACEHOLDER.test(v.trim())) { delete env[k]; gone.push(k); }
  }
  return gone;
}

export const scrubbedKeys = scrubPlaceholders();
if (scrubbedKeys.length) console.log('[env] example placeholder values ignored (fill in real values in .env to enable): ' + scrubbedKeys.join(', '));
