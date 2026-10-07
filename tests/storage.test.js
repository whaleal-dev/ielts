import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordStore, RECORD_LIMIT, PREFIX, byteSize, wordRecords } from '../src/storage.js';
import { emptyDay, markStudied } from '../src/progress.js';

class MemoryStorage {
  constructor() { this.entries = new Map(); this.failAt = Infinity; this.writes = 0; }
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index]; }
  getItem(key) { return this.entries.get(key) ?? null; }
  removeItem(key) { this.entries.delete(key); }
  setItem(key, value) {
    this.writes += 1;
    if (this.writes === this.failAt) throw new DOMException('Full', 'QuotaExceededError');
    this.entries.set(key, value);
  }
}

test('record limits count UTF-8 bytes and reject the entire batch before writing', async () => {
  const storage = new MemoryStorage();
  const store = new RecordStore({ indexedDB: null, localStorage: storage });
  await store.load();
  assert.throws(() => store.setMany([['prefs', { view: 'study' }], ['large', '中'.repeat(3000)]]), RangeError);
  assert.equal(storage.length, 0);
  assert.equal(store.pending.size, 0);
});

test('quota failure keeps pending records, rolls back the batch, and can be retried', async () => {
  const storage = new MemoryStorage();
  const statuses = [];
  const store = new RecordStore({ indexedDB: null, localStorage: storage, onStatus: (status) => statuses.push(status) });
  await store.load();
  await store.set('prefs', { view: 'study' });
  const original = storage.getItem(PREFIX + 'prefs');
  storage.failAt = storage.writes + 2;
  assert.equal(await store.setMany([['prefs', { view: 'stats' }], ['word:a', { count: 1 }]]), false);
  assert.equal(storage.getItem(PREFIX + 'prefs'), original);
  assert.equal(storage.getItem(PREFIX + 'word:a'), null);
  assert.equal(store.pending.size, 2);
  assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /空间不足/);
  storage.failAt = Infinity;
  assert.equal(await store.flush(), true);
  assert.equal(store.pending.size, 0);
  assert.equal(JSON.parse(storage.getItem(PREFIX + 'word:a')).value.count, 1);
});

test('updates during an asynchronous write retain the newest value', async () => {
  const store = new RecordStore({ indexedDB: null, localStorage: new MemoryStorage() });
  await store.load();
  const writes = [];
  let release;
  store.write = async (entries) => {
    writes.push(entries);
    if (writes.length === 1) await new Promise((resolve) => { release = resolve; });
  };
  const first = store.set('word:a', { count: 1 });
  store.set('word:a', { count: 2 });
  release();
  await first;
  assert.equal(writes.length, 2);
  assert.equal(store.saved.get(PREFIX + 'word:a').value.count, 2);
  assert.equal(store.pending.size, 0);
});

test('long legacy notes round-trip through bounded records without truncation', async () => {
  const storage = new MemoryStorage();
  const store = new RecordStore({ indexedDB: null, localStorage: storage });
  await store.load();
  const note = '旧笔记😀\n'.repeat(3000);
  await store.setMany(wordRecords('a', { count: 2, note }));
  const loaded = await new RecordStore({ indexedDB: null, localStorage: storage }).load();
  const parts = loaded.entries.get('word:a').noteParts;
  const recovered = Array.from({ length: parts }, (_, index) => loaded.entries.get(`note:a:${index}`)).join('');
  assert.equal(recovered, note);
  assert.ok(store.sizes().largest <= RECORD_LIMIT);
});

test('a full vocabulary day stays below 1 KiB and repeated study does not inflate unique counts', () => {
  const day = emptyDay();
  for (let i = 0; i < 3632; i += 1) markStudied(day, i, 3632);
  assert.equal(day.studied, 3632);
  assert.equal(markStudied(day, 0, 3632), false);
  assert.equal(day.studied, 3632);
  assert.ok(byteSize(day) < 1024);
});
