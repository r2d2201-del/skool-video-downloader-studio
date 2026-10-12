const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ProgressStore, PREFIX, LEGACY } = require('../js/progress-store');
class MemoryStorage {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, v); }
  removeItem(k) { this.data.delete(k); }
}
const make = (storage = new MemoryStorage()) => new ProgressStore({ storage, uuid: randomUUID });
function fakeCloud() {
  const data = new Map();
  return {
    data,
    async list(user) { return [...data.values()].filter(r => r.user_id === user).map(r => ({ ...r })); },
    async write(user, op) {
      const key = JSON.stringify([user, op.course, op.lesson]);
      const row = data.get(key);
      if (row?.mutation_id === op.id) return { applied: true, row: { ...row } };
      if (row && (op.kind === 'import' || op.baseVersion !== row.version)) return { applied: false, row: { ...row } };
      const next = { user_id: user, course_id: op.course, lesson_id: op.lesson, completed: op.completed, version: (row?.version || 0) + 1, mutation_id: op.id };
      data.set(key, next);
      return { applied: true, row: { ...next } };
    }
  };
}
const catalog = [{ courses: [{ id: 'course', modules: [{ lessons: [{ id: 'a' }, { id: 'b' }] }] }] }];

test('local progress survives a reload and stale tabs cannot erase other lessons', () => {
  const storage = new MemoryStorage(), a = make(storage), b = make(storage);
  a.setCompleted('course', 'a', true);
  b.setCompleted('course', 'b', true);
  const reloaded = make(storage);
  assert.equal(reloaded.isCompleted('course', 'a'), true);
  assert.equal(reloaded.isCompleted('course', 'b'), true);
  b.setCompleted('course', 'a', false);
  assert.equal(a.isCompleted('course', 'a'), false);
});
test('legacy marks migrate without overwriting explicit unmarks', () => {
  const storage = new MemoryStorage(); storage.setItem(LEGACY, '["a"]');
  const store = make(storage); store.setCatalog(catalog);
  assert.equal(store.isCompleted('course', 'a'), true);
  store.setCompleted('course', 'a', false); store.setCatalog(catalog);
  assert.equal(store.isCompleted('course', 'a'), false);
  assert.equal(storage.getItem(LEGACY), '["a"]');
});
test('two devices share completions and unmarks after sign-in', async () => {
  const cloud = fakeCloud(), a = make(), b = make();
  a.setAccount('owner'); b.setAccount('owner');
  a.setCompleted('course', 'a', true); await a.sync(cloud); await b.sync(cloud);
  assert.equal(b.isCompleted('course', 'a'), true);
  b.setCompleted('course', 'a', false); await b.sync(cloud); await a.sync(cloud);
  assert.equal(a.isCompleted('course', 'a'), false);
});
test('offline changes survive closing the page and reconnecting', async () => {
  const storage = new MemoryStorage(), a = make(storage), cloud = fakeCloud(); a.setAccount('owner');
  a.setCompleted('course', 'a', true);
  await assert.rejects(a.sync({ list: async () => { throw Error('offline'); } }));
  const reloaded = make(storage); reloaded.setAccount('owner');
  assert.equal(reloaded.pending().length, 1);
  await reloaded.sync(cloud);
  assert.equal(reloaded.pending().length, 0);
  assert.equal((await cloud.list('owner'))[0].completed, true);
});
test('stale offline change cannot undo a newer change to the same lesson', async () => {
  const cloud = fakeCloud(), a = make(), b = make(); a.setAccount('owner'); b.setAccount('owner');
  a.setCompleted('course', 'a', true); await a.sync(cloud); await b.sync(cloud);
  b.setCompleted('course', 'a', true);
  a.setCompleted('course', 'a', false); await a.sync(cloud);
  const result = await b.sync(cloud);
  assert.equal(result.conflicts, 1);
  assert.equal(b.isCompleted('course', 'a'), false);
  assert.equal((await cloud.list('owner'))[0].completed, false);
});
test('lost response is retried idempotently without incrementing the server version', async () => {
  const cloud = fakeCloud(), a = make(); a.setAccount('owner'); a.setCompleted('course', 'a', true);
  await assert.rejects(a.sync({ list: cloud.list, write: async (u, op) => { await cloud.write(u, op); throw Error('lost response'); } }));
  assert.equal(a.pending().length, 1);
  await a.sync(cloud);
  assert.equal(a.pending().length, 0);
  assert.equal((await cloud.list('owner'))[0].version, 1);
});
test('a click during a request stays pending and is sent at the new revision', async () => {
  const cloud = fakeCloud(), a = make(); a.setAccount('owner'); a.setCompleted('course', 'a', true);
  await a.sync({ list: cloud.list, write: async (u, op) => { a.setCompleted('course', 'a', false); return cloud.write(u, op); } });
  assert.equal(a.pending().length, 1);
  assert.equal(a.isCompleted('course', 'a'), false);
  await a.sync(cloud);
  assert.equal((await cloud.list('owner'))[0].completed, false);
  assert.equal(a.pending().length, 0);
});
test('account switch during request cannot acknowledge or copy another account history', async () => {
  const cloud = fakeCloud(), a = make(); a.setAccount('one'); a.setCompleted('course', 'a', true);
  await a.sync({ list: cloud.list, write: async (u, op) => { a.setAccount('two'); return cloud.write(u, op); } });
  assert.equal(a.isCompleted('course', 'a'), false);
  assert.equal(a.pending().length, 0);
  assert.equal((await cloud.list('two')).length, 0);
  a.setAccount('one'); assert.equal(a.pending().length, 1); await a.sync(cloud);
  assert.equal(a.isCompleted('course', 'a'), true);
});
test('legacy import belongs to one account and never resurrects a cloud unmark', async () => {
  const cloud = fakeCloud(), old = make(), a = make();
  old.setAccount('one'); old.setCompleted('course', 'a', false); await old.sync(cloud);
  a.storage.setItem(LEGACY, '["a","b"]'); a.setCatalog(catalog); a.setAccount('one'); await a.sync(cloud);
  assert.equal(a.isCompleted('course', 'a'), false);
  assert.equal(a.isCompleted('course', 'b'), true);
  a.setAccount('two'); await a.sync(cloud);
  assert.equal((await cloud.list('two')).length, 0);
});
test('same lesson IDs in different courses remain independent', () => {
  const a = make(); a.setCompleted('one', 'intro', true);
  assert.equal(a.isCompleted('two', 'intro'), false);
});
test('storage failures never report a successfully saved completion', () => {
  const storage = new MemoryStorage(), a = make(storage);
  storage.setItem = () => { throw Error('quota exceeded'); };
  assert.throws(() => a.setCompleted('course', 'a', true), /quota/);
  assert.equal(a.isCompleted('course', 'a'), false);
});
test('corrupt legacy JSON is preserved for recovery', () => {
  const storage = new MemoryStorage(); storage.setItem(LEGACY, '[bad');
  assert.throws(() => make(storage).setCatalog(catalog), /dañados/);
  assert.equal(storage.getItem(LEGACY), '[bad');
});
test('fresh tab observes cached account data and pending edits from the other tab', () => {
  const storage = new MemoryStorage(), a = make(storage), b = make(storage); a.setAccount('one'); b.setAccount('one');
  a.setCompleted('course', 'a', true); b.setCompleted('course', 'b', true);
  assert.equal(a.completedKeys().size, 2);
  assert.equal(b.completedKeys().size, 2);
  assert.ok([...storage.data.keys()].every(k => k.startsWith(PREFIX)));
});
