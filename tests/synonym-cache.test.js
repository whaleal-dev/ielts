import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGroups } from '../src/synonyms/model.js';
import { MAX_FILE_SIZE, MAX_CACHED_FILES, readImportedFiles, updateFileCache, fileCacheRecords, readFileCache, selectCachedFiles } from '../src/synonyms/fileCache.js';
import { readValue, valueRecords } from '../src/practice/records.js';
import { byteSize, RecordStore } from '../src/storage.js';

const file = (name, text = 'reserve, book') => ({ name, size: Buffer.byteLength(text), text: async () => text });
const cachedFile = (name, text = 'reserve, book') => ({ name, size: Buffer.byteLength(text), text, groupCount: 1 });

test('the default synonym library contains all 179 groups and 672 terms', async () => {
  const text = await readFile(new URL('../src/synonyms/default-groups.json', import.meta.url), 'utf8');
  const groups = parseGroups(text, 'default.json');
  assert.equal(groups.length, 179);
  assert.equal(groups.flat().length, 672);
  assert.deepEqual(groups[0], ['reserve', 'book']);
  assert.deepEqual(groups[1], ['in advance', 'ahead', 'before']);
});

test('file imports accept exactly 2 MiB and reject any oversized batch before reading files', async () => {
  assert.equal(MAX_FILE_SIZE, 2 * 1024 * 1024);
  const text = 'reserve, book\n'.padEnd(MAX_FILE_SIZE, ' ');
  const imported = await readImportedFiles([file('limit.txt', text)]);
  assert.deepEqual(imported.groups, [['reserve', 'book']]);
  assert.equal(imported.files[0].size, MAX_FILE_SIZE);
  assert.equal(imported.files[0].text, text);
  let reads = 0;
  const incoming = [
    { name: 'ok.txt', size: 10, text: async () => { reads++; return 'fee, cost'; } },
    { name: 'large.txt', size: MAX_FILE_SIZE + 1, text: async () => { reads++; return 'fee, cost'; } },
  ];
  await assert.rejects(readImportedFiles(incoming), /large\.txt.*2 MB/);
  assert.equal(reads, 0);
});

test('multiple imports preserve original texts and order while malformed files reject the batch', async () => {
  const incoming = [file('a.TXT', '\uFEFFreserve, book，预订\nin advance, ahead'), file('b.JSON', '[["fee","cost"]]')];
  const imported = await readImportedFiles(incoming);
  assert.deepEqual(imported.groups, [['reserve', 'book', '预订'], ['in advance', 'ahead'], ['fee', 'cost']]);
  assert.deepEqual(imported.files.map(({ name, groupCount }) => ({ name, groupCount })), [{ name: 'a.TXT', groupCount: 2 }, { name: 'b.JSON', groupCount: 1 }]);
  assert.equal(imported.files[0].text, await incoming[0].text());
  await assert.rejects(readImportedFiles([incoming[0], file('invalid.json', '["word"]')]), /invalid\.json.*二维数组/);
  await assert.rejects(readImportedFiles([file('empty.txt', '\n ')]), /没有有效分组/);
  await assert.rejects(readImportedFiles([file('bad.csv')]), /bad\.csv.*请上传 TXT 词库文件/);
});

test('the twenty-first cached file evicts the oldest slot and same-name uploads become newest', () => {
  assert.equal(MAX_CACHED_FILES, 20);
  const first = updateFileCache([], Array.from({ length: 20 }, (_, index) => cachedFile(`${index}.txt`)));
  const original = first.map((entry) => ({ ...entry }));
  const replacement = updateFileCache(first, [cachedFile('0.txt', 'journey, trip')]);
  assert.equal(replacement.length, 20);
  assert.equal(replacement.at(-1).name, '0.txt');
  assert.equal(replacement.at(-1).slot, first[0].slot);
  assert.equal(replacement.at(-1).text, 'journey, trip');
  const next = updateFileCache(replacement, [cachedFile('20.txt')]);
  assert.equal(next.length, 20);
  assert.equal(next.some((entry) => entry.name === '1.txt'), false);
  assert.equal(next.some((entry) => entry.name === '0.txt'), true);
  assert.equal(next.at(-1).slot, first[1].slot);
  assert.deepEqual(first, original);
  const duplicates = updateFileCache([], [cachedFile('same.txt', 'first, original'), cachedFile('other.txt'), cachedFile('same.txt', 'last, updated')]);
  assert.deepEqual(duplicates.map((entry) => entry.name), ['other.txt', 'same.txt']);
  assert.equal(duplicates.at(-1).text, 'last, updated');
  const batch = updateFileCache([], Array.from({ length: 25 }, (_, index) => cachedFile(`batch-${index}.txt`)));
  assert.deepEqual(batch.map((entry) => entry.name), Array.from({ length: 20 }, (_, index) => `batch-${index + 5}.txt`));
  assert.equal(new Set(batch.map((entry) => entry.slot)).size, 20);
});

test('cache persistence stays below 8 KiB per record and clears replaced content chunks', async () => {
  const data = new Map();
  const localStorage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) ?? null };
  const store = new RecordStore({ indexedDB: null, localStorage, prefix: 'ielts-synonyms-v1:', legacyKey: null });
  await store.open();
  const oldText = 'old unique content, book\n'.padEnd(MAX_FILE_SIZE, ' ');
  const previous = updateFileCache([], [cachedFile('collection.txt', oldText)]);
  const entries = new Map();
  const persist = async (records) => {
    assert.equal(await store.setMany(records), true);
    records.forEach(([key, value]) => entries.set(key, value));
    assert.ok([...store.saved].every(([key, record]) => byteSize({ key, ...record }) <= 8192));
  };
  await persist(fileCacheRecords([], previous));
  assert.deepEqual(readFileCache(entries), previous);
  const next = updateFileCache(previous, [cachedFile('collection.txt', 'fee, cost')]);
  await persist(fileCacheRecords(previous, next));
  assert.deepEqual(readFileCache(entries), next);
  assert.ok(![...data.values()].some((record) => record.includes('old unique content')));
  assert.ok([...entries].filter(([key]) => /^file-cache:0:\d+$/.test(key)).slice(1).every(([, value]) => value === null));
});

test('cache restore ignores incomplete or invalid slots and filenames use bounded chunk keys', () => {
  const previous = updateFileCache([], [cachedFile('词库'.repeat(500) + '.json', '[["quo\\\"te","中文","emoji😀"]]')]);
  const records = fileCacheRecords([], previous);
  assert.ok(records.every(([key]) => key.length < 40));
  const entries = new Map(records);
  assert.deepEqual(readFileCache(entries), previous);
  entries.set(`file-cache:${previous[0].slot}:0`, null);
  assert.deepEqual(readFileCache(entries), []);
});

test('multiple cached selections merge in displayed order without changing FIFO or duplicating selections', () => {
  const cache = updateFileCache([], [cachedFile('old.txt', 'reserve, book\nin advance, ahead'), cachedFile('new.json', '[["fee","cost"]]')]);
  const original = cache.map((file) => ({ ...file }));
  const selected = selectCachedFiles(cache, ['old.txt', 'new.json', 'old.txt']);
  assert.deepEqual(selected, { groups: [['fee', 'cost'], ['reserve', 'book'], ['in advance', 'ahead']], names: ['new.json', 'old.txt'] });
  assert.deepEqual(cache, original);
  assert.deepEqual(selectCachedFiles(cache, []), { groups: [], names: [] });
  assert.throws(() => selectCachedFiles(cache, ['missing.txt']), /已不存在/);
  assert.throws(() => selectCachedFiles(updateFileCache([], [cachedFile('invalid.json', '["word"]')]), ['invalid.json']), /invalid\.json.*二维数组/);
});

test('manual cache deletion clears the complete file, keeps learning data and frees the slot', () => {
  const previous = updateFileCache([], [cachedFile('delete.txt', 'unique cached content, word\n'.padEnd(3500, ' ')), cachedFile('keep.txt', 'fee, cost')]);
  const learning = [['groups', [['current', 'library']]], ['note:current', 'Learning note retained']];
  const entries = new Map([...learning.flatMap(([key, value]) => valueRecords(key, value)), ...fileCacheRecords([], previous)]);
  const next = previous.filter((file) => file.name !== 'delete.txt');
  const changes = fileCacheRecords(previous, next);
  assert.ok(changes.every(([key]) => key.startsWith('file-cache:')));
  changes.forEach(([key, value]) => entries.set(key, value));
  assert.deepEqual(readFileCache(entries), next);
  assert.ok([...entries].filter(([key]) => key === 'file-cache:0' || key.startsWith('file-cache:0:')).every(([, value]) => value === null));
  assert.deepEqual(readValue(entries, 'groups'), [['current', 'library']]);
  assert.equal(readValue(entries, 'note:current'), 'Learning note retained');
  fileCacheRecords(next, []).forEach(([key, value]) => entries.set(key, value));
  assert.deepEqual(readFileCache(entries), []);
  assert.ok([...entries].filter(([key]) => /^file-cache:\d+(?::\d+)?$/.test(key)).every(([, value]) => value === null));
  const reused = updateFileCache([], [cachedFile('new.txt', 'new, latest')]);
  assert.equal(reused[0].slot, 0);
  fileCacheRecords([], reused).forEach(([key, value]) => entries.set(key, value));
  assert.deepEqual(readFileCache(entries), reused);
});

test('a failed cache deletion keeps the persisted file and retries without changing the active library or notes', async () => {
  const data = new Map();
  let failKey = null;
  const localStorage = {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index],
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => {
      if (key === failKey) { failKey = null; throw new DOMException('Full', 'QuotaExceededError'); }
      data.set(key, value);
    },
  };
  const statuses = [];
  const options = { indexedDB: null, localStorage, prefix: 'ielts-synonyms-v1:', legacyKey: null };
  const store = new RecordStore({ ...options, onStatus: (status) => statuses.push(status) });
  await store.load();
  const previous = updateFileCache([], [cachedFile('delete.txt', 'unique cached content, book\n'.padEnd(3500, ' ')), cachedFile('keep.txt', 'fee, cost')]);
  const learning = [['groups', [['current', 'library']]], ['note:current', 'Learning note retained']];
  assert.equal(await store.setMany([...learning.flatMap(([key, value]) => valueRecords(key, value)), ...fileCacheRecords([], previous)]), true);
  const original = new Map(data);
  const next = previous.filter((file) => file.name !== 'delete.txt');
  failKey = `${options.prefix}file-cache:0:0`;
  assert.equal(await store.setMany(fileCacheRecords(previous, next)), false);
  assert.deepEqual(data, original);
  assert.equal(statuses.at(-1).state, 'error');
  assert.ok(store.pending.size > 0);
  assert.deepEqual(readFileCache((await new RecordStore(options).load()).entries), previous);
  assert.equal(await store.flush(), true);
  const restored = (await new RecordStore(options).load()).entries;
  assert.deepEqual(readFileCache(restored), next);
  assert.deepEqual(readValue(restored, 'groups'), [['current', 'library']]);
  assert.equal(readValue(restored, 'note:current'), 'Learning note retained');
  assert.ok(![...data.values()].some((record) => record.includes('unique cached content')));
  assert.equal(store.pending.size, 0);
  assert.equal(statuses.at(-1).state, 'saved');
});
