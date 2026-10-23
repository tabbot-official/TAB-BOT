import test from 'node:test';
import assert from 'node:assert/strict';
import { MetadataCache } from '../src/groups/metadataCache.js';
const meta = (admin = null) => ({ participants: [{ id: 'user', admin }] });

test('metadata cache reuses display reads but forces fresh privileged reads', async () => {
  let calls = 0, admin = 'admin';
  const cache = new MetadataCache();
  const sock = { groupMetadata: async () => { calls++; return meta(admin); } };
  assert.equal((await cache.get(sock, 'g')).participants[0].admin, 'admin');
  admin = null;
  assert.equal((await cache.get(sock, 'g')).participants[0].admin, 'admin');
  assert.equal(calls, 1);
  assert.equal((await cache.get(sock, 'g', true)).participants[0].admin, null);
  assert.equal(calls, 2);
});

test('failed fresh or expired metadata reads never return stale admin rights', async () => {
  let now = 0, fail = false;
  const cache = new MetadataCache({ now: () => now, ttl: 10 });
  const sock = { groupMetadata: async () => { if (fail) throw Error('offline'); return meta('admin'); } };
  await cache.get(sock, 'g'); fail = true;
  await assert.rejects(cache.get(sock, 'g', true), /offline/);
  await assert.rejects(cache.get(sock, 'g'), /offline/);
  fail = false; await cache.get(sock, 'g'); fail = true; now = 10;
  await assert.rejects(cache.get(sock, 'g'), /offline/);
});

test('metadata cache is socket scoped and coalesces concurrent reads', async () => {
  const cache = new MetadataCache(); let resolve, calls = 0;
  const sock = { groupMetadata: () => { calls++; return new Promise(r => { resolve = r; }); } };
  const a = cache.get(sock, 'g'), b = cache.get(sock, 'g');
  await new Promise(r => setImmediate(r));
  resolve(meta('admin')); assert.deepEqual(await a, await b); assert.equal(calls, 1);
  const other = { groupMetadata: async () => meta(null) };
  assert.equal((await cache.get(other, 'g')).participants[0].admin, null);
});

test('membership invalidation prevents an older in-flight result from reviving cache', async () => {
  const cache = new MetadataCache(); let resolve;
  const sock = { groupMetadata: () => new Promise(r => { resolve = r; }) };
  const old = cache.get(sock, 'g'); await new Promise(r => setImmediate(r)); cache.drop('g');
  resolve(meta('admin')); assert.equal(await old, null);
  sock.groupMetadata = async () => meta(null);
  assert.equal((await cache.get(sock, 'g')).participants[0].admin, null);
});

test('malformed metadata fails closed and cache stays bounded', async () => {
  const cache = new MetadataCache({ maxGroups: 2 });
  const sock = { groupMetadata: async () => ({}) };
  assert.equal(await cache.get(sock, 'a'), null);
  sock.groupMetadata = async () => meta();
  await cache.get(sock, 'b'); await cache.get(sock, 'c');
  assert.equal(cache.groups.size, 2); assert.equal(cache.groups.has('a'), false);
});

test('synchronous provider failure is retriable instead of poisoning pending state', async () => {
  const cache = new MetadataCache();
  const sock = { groupMetadata: () => { throw Error('sync offline'); } };
  await assert.rejects(cache.get(sock, 'g'), /sync offline/);
  sock.groupMetadata = () => meta();
  assert.deepEqual(await cache.get(sock, 'g'), meta());
});

test('fresh authorization supersedes an older pending display read', async () => {
  const cache = new MetadataCache(); let calls = 0;
  const resolvers = [];
  const sock = {groupMetadata: () => {calls++; return new Promise(r => resolvers.push(r));}};
  const display = cache.get(sock,'g'); await new Promise(r=>setImmediate(r));
  const auth = cache.get(sock,'g',true), coalescedAuth = cache.get(sock,'g',true);
  await new Promise(r=>setImmediate(r)); assert.equal(calls,2);
  resolvers[0](meta('admin')); assert.equal(await display,null);
  resolvers[1](meta(null)); assert.deepEqual(await auth,meta(null)); assert.deepEqual(await coalescedAuth,meta(null));
});
