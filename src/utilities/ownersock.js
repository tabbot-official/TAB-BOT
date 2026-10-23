// Shared handle to the live WhatsApp socket so background jobs (schedules,
// health watch) can act without an incoming message. Set on connection open.
let sock = null, openedAt = 0;
export const setSock = (s) => { sock = s; openedAt = Date.now(); };
export const getSock = () => sock;
export const sockAge = () => (sock ? Date.now() - openedAt : Infinity);
