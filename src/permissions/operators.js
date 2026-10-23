import fs from 'node:fs';
import path from 'node:path';
// Extra people who get owner-level /agent control. Panel-local private file (data/ is not in the repo):
// data/agent-operators.json = {"numbers":["<country code + number, digits only>"]}. Nothing here is hard-coded.
const FILE = path.join('data', 'agent-operators.json');
// Read on every call (a few bytes, only on commands/downloads) so removing a number takes effect immediately, with no stale cache.
export function operatorNumbers() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return (Array.isArray(j.numbers) ? j.numbers : []).map((x) => String(x).replace(/\D/g, '')).filter((x) => /^[1-9]\d{6,14}$/.test(x)).slice(0, 5);
  } catch { return []; }
}
/** Only a transport-verified phone identity (phone JID or Baileys LID->PN mapping) in a private chat can be an operator. */
export function operatorIdentity(identity, kind) {
  if (kind !== 'private' || !identity?.verified || !identity.phoneNumber) return null;
  return operatorNumbers().includes(String(identity.phoneNumber)) ? String(identity.phoneNumber) : null;
}
export const actorTag = (n) => 'op-' + (n ? String(n).slice(-2).padStart(2, '*') : '??');
