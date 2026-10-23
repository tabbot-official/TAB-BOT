import config from '../config/config.js';
import { get, list } from '../recover/store.js';
import { sendEntry, whoLine, quiet } from '../recover/index.js';

/** Shared logic for /vv and /vvn: reply to a view-once, or take the latest one saved. */
export async function recoverViewOnce(ctx, types, label) {
  const to = await quiet(ctx);
  const m = ctx.msg.message || {};
  const info = m.extendedTextMessage?.contextInfo;
  let e = info?.stanzaId ? get(info.stanzaId) : null;
  if (e && e.kind !== 'vo') e = null;
  if (!e) e = list((x) => x.kind === 'vo' && types.includes(x.type))[0] || null;
  if (!e) return ctx.sock.sendMessage(to, { text: `No ${label} saved yet. I save view-once items that arrive while I am online. Older ones cannot be recovered.` });
  if (!types.includes(e.type)) return ctx.sock.sendMessage(to, { text: `That one is a ${e.type}. Use ${config.prefix}${e.type === 'audio' ? 'vvn' : 'vv'} for it.` });
  await sendEntry(ctx.sock, to, e, `View-once from ${whoLine(e)}`);
}
