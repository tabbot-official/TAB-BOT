// Native metadata cache. Cached data is for display and best-effort moderation,
// never a replacement for a fresh privileged-command authorization check.
export class MetadataCache {
  constructor({ ttl = 45_000, maxGroups = 300, now = () => Date.now() } = {}) {
    this.ttl = ttl;
    this.maxGroups = maxGroups;
    this.now = now;
    this.groups = new Map();
  }

  drop(gid) { this.groups.delete(gid); }

  async get(sock, gid, fresh = false) {
    let group = this.groups.get(gid);
    if (!group) {
      group = new WeakMap();
      this.groups.set(gid, group);
      if (this.groups.size > this.maxGroups) this.groups.delete(this.groups.keys().next().value);
    }
    let record = group.get(sock);
    if (!fresh && record?.meta && this.now() - record.at < this.ttl) return record.meta;
    if (record?.pending && (!fresh || record.fresh)) return record.pending;
    record = { meta: null, at: 0, pending: null, fresh };
    group.set(sock, record);
    record.pending = Promise.resolve().then(async () => {
      try {
        const meta = await sock.groupMetadata(gid);
        // A membership event or explicit invalidation won the race. Do not use
        // the earlier request's result to authorize or refill the cache.
        if (this.groups.get(gid) !== group || group.get(sock) !== record) return null;
        if (!meta || !Array.isArray(meta.participants)) return null;
        record.meta = meta;
        record.at = this.now();
        return meta;
      } finally {
        record.pending = null;
      }
    });
    return record.pending;
  }
}
