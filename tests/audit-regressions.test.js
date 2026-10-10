import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createRenderer, nextTick } from 'vue';
import { RecordStore, PREFIX, RECORD_LIMIT, byteSize } from '../src/storage.js';
import { valueRecords, readValue } from '../src/practice/records.js';
import { createWordLibrary, directoryRecords, wordLibraryRecords, readWordLibraries, libraryDeleteKeys } from '../src/wordLibraries.js';
import { parseWordText } from '../src/wordImport.js';
import * as synonyms from '../src/synonyms/model.js';
import { readImportedFiles, fileCacheRecords, updateFileCache, readFileCache } from '../src/synonyms/fileCache.js';
import * as progress from '../src/progress.js';
import { MemoryStorage, MemoryIndexedDB } from './storageFixtures.js';

globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) };
const modes = ['localStorage', 'IndexedDB'];
const storageOptions = (mode, localStorage = new MemoryStorage(), indexedDB = new MemoryIndexedDB()) => ({ localStorage, indexedDB: mode === 'IndexedDB' ? indexedDB : null, legacyKey: null });
const file = (name, content) => { const blob = new Blob([content]); return { name, size: blob.size, arrayBuffer: () => blob.arrayBuffer(), text: () => blob.text() }; };

for (const mode of modes) {
  test(`AUDIT-001: stale ${mode} directories preserve independent imports, deletion and retry`, async () => {
    const options = storageOptions(mode);
    const first = new RecordStore(options), second = new RecordStore(options);
    await Promise.all([first.load(), second.load()]);
    const parsed = parseWordText('apple | 苹果', 'a.txt');
    const a = createWordLibrary(parsed, 'A', [], { id: 'a' }), b = createWordLibrary(parsed, 'B', [], { id: 'b' });
    await Promise.all([first.commit([...directoryRecords([a]), ...wordLibraryRecords(a)]), second.commit([...directoryRecords([b]), ...wordLibraryRecords(b)])]);
    const latest = (await new RecordStore(options).load()).entries;
    assert.deepEqual(new Set(readWordLibraries(latest, () => '').map((entry) => entry.id)), new Set(['a', 'b']));
    const c = createWordLibrary(parsed, 'C', [], { id: 'c' });
    const deleted = libraryDeleteKeys([...latest.keys()], a);
    await Promise.all([first.commit([], deleted), second.commit([...directoryRecords([c]), ...wordLibraryRecords(c)])]);
    const restored = (await new RecordStore(options).load()).entries;
    assert.deepEqual(new Set(readWordLibraries(restored, () => '').map((entry) => entry.id)), new Set(['b', 'c']));
    assert.ok(deleted.every((key) => !restored.has(key)));
    if (mode === 'IndexedDB') options.indexedDB.failWrite = true;
    else options.localStorage.failAt = options.localStorage.operations + 2;
    assert.equal(await first.commit([...directoryRecords([a]), ...wordLibraryRecords(a)]), false);
    assert.deepEqual(new Set(readWordLibraries((await new RecordStore(options).load()).entries, () => '').map((entry) => entry.id)), new Set(['b', 'c']));
    assert.equal(await first.commit([...directoryRecords([a]), ...wordLibraryRecords(a)]), true);
  });

  test(`AUDIT-004: ${mode} shrinking and empty values physically remove obsolete chunks, with retry`, async () => {
    const options = storageOptions(mode);
    const store = new RecordStore(options); await store.load();
    const keys = ['list', 'groups', 'source', 'note:apple'];
    const large = 'old content😀'.repeat(1500);
    await store.setMany([...keys.flatMap((key) => valueRecords(key, large)), ['unrelated', 'keep']]);
    const before = store.sizes();
    if (mode === 'IndexedDB') options.indexedDB.failWrite = true;
    else options.localStorage.failAt = options.localStorage.operations + 3;
    assert.equal(await store.setMany(keys.flatMap((key) => valueRecords(key, ''))), false);
    const failed = (await new RecordStore(options).load()).entries;
    assert.ok(keys.every((key) => readValue(failed, key) === large));
    assert.equal(await store.flush(), true);
    const restored = (await new RecordStore(options).load()).entries;
    for (const key of keys) {
      assert.equal(readValue(restored, key), '');
      assert.equal([...restored.keys()].filter((entry) => entry.startsWith(key + ':')).length, 1);
    }
    assert.equal(restored.get('unrelated'), 'keep');
    assert.equal(store.sizes().count, keys.length * 2 + 1);
    assert.ok(store.sizes().total < before.total / 10);
    assert.ok([...store.saved].every(([key, entry]) => byteSize({ key, ...entry }) <= RECORD_LIMIT));
  });

  test(`AUDIT-005: ${mode} cache deletion removes keys while saving null remains supported`, async () => {
    const options = storageOptions(mode);
    const store = new RecordStore({ ...options, prefix: 'ielts-synonyms-v1:' }); await store.load();
    const old = updateFileCache([], [{ name: 'old.txt', text: 'apple, pear'.padEnd(4000), size: 4000, groupCount: 1 }]);
    await store.setMany([...fileCacheRecords([], old), ['position', null], ['unrelated', 'keep']]);
    await store.setMany(fileCacheRecords(old, []));
    const entries = (await new RecordStore({ ...options, prefix: store.prefix }).load()).entries;
    assert.equal([...entries.keys()].filter((key) => /^file-cache:0(?::|$)/.test(key)).length, 0);
    assert.deepEqual(readFileCache(entries), []);
    assert.ok(entries.has('position')); assert.equal(entries.get('position'), null); assert.equal(entries.get('unrelated'), 'keep');
  });
}

test('AUDIT-006: UTF-8 and BOM are accepted; invalid UTF-8, GBK and UTF-16 reject a complete batch', async () => {
  const imported = await readImportedFiles([file('good.txt', '\uFEFFapple,苹果'), file('good.json', '\uFEFF[["pear","梨"]]')]);
  assert.deepEqual(imported.groups, [['apple', '苹果'], ['pear', '梨']]);
  for (const content of [new Uint8Array([97, 44, 0xff]), new Uint8Array([97, 44, 0xd4, 0xa4, 0xb6, 0xa9]), new Uint8Array([0xff, 0xfe, 97, 0]), new Uint8Array([97, 0, 44, 0, 98, 0])]) {
    await assert.rejects(readImportedFiles([file('good.txt', 'apple, pear'), file('bad.txt', content)]), /bad.txt.*UTF-8/);
  }
});

test('AUDIT-003: single groups, total terms and aggregate file bytes have exact limits', async () => {
  assert.equal(synonyms.parseGroups(Array(200).fill('a').join(','), 'limit.txt')[0].length, 200);
  assert.throws(() => synonyms.parseGroups(Array(201).fill('a').join(','), 'large.txt'), /200/);
  const boundary = Array.from({ length: 50 }, () => Array(200).fill('a').join(',')).join('\n');
  assert.equal(synonyms.parseGroups(boundary, 'limit.txt').flat().length, 10000);
  assert.throws(() => synonyms.parseGroups(boundary + '\na', 'large.txt'), /10000/);
  assert.throws(() => synonyms.parseGroups('a,'.repeat(1048576), 'dense.txt'), /200/);
  await assert.rejects(readImportedFiles([file('a.txt', boundary), file('b.txt', 'b')]), /10000/);
  const byteBoundary = 'a, b\n'.padEnd(2 * 1024 * 1024, ' ');
  const fullBatch = await readImportedFiles(Array.from({ length: 5 }, (_, index) => file(`limit-${index}.txt`, byteBoundary)));
  assert.equal(fullBatch.files.reduce((bytes, entry) => bytes + entry.size, 0), 10 * 1024 * 1024);
  assert.equal(fullBatch.groups.flat().length, 10);
  let reads = 0;
  const oversized = Array.from({ length: 6 }, (_, index) => ({ name: `${index}.txt`, size: 2 * 1024 * 1024, arrayBuffer: async () => { reads++; return new ArrayBuffer(); } }));
  await assert.rejects(readImportedFiles(oversized), /10 MiB/); assert.equal(reads, 0);
});

test('AUDIT-003: group loops use a compact queue with correct ordering and Chinese display labels', () => {
  const queue = synonyms.groupQueue([{ index: 2, words: ['apple', '中文', 'pear'] }, { index: 7, words: ['plum'] }], 10);
  assert.ok(!Array.isArray(queue));
  assert.equal(queue.length, 30);
  assert.deepEqual(queue.at(0), { text: 'apple', group: 2, word: 0, cycle: 1 });
  assert.deepEqual(queue.at(19), { text: 'pear', group: 2, word: 2, cycle: 10 });
  assert.deepEqual(queue.at(20), { text: 'plum', group: 7, word: 0, cycle: 1 });
  assert.equal(queue.at(30), undefined);
});

test('AUDIT-004/005: IndexedDB mirror cleanup survives failure and reload without resurrecting deleted content', async () => {
  const localStorage = new MemoryStorage(), indexedDB = new MemoryIndexedDB();
  const prefix = 'ielts-synonyms-v1:';
  const previous = updateFileCache([], [{ name: 'old.txt', text: 'apple, pear'.padEnd(4000), size: 4000, groupCount: 1 }]);
  const fallback = new RecordStore({ localStorage, indexedDB: null, prefix, legacyKey: null }); await fallback.load();
  await fallback.setMany([...fileCacheRecords([], previous), ...valueRecords('groups', 'old'.repeat(2000)), ['unrelated', 'keep']]);
  const options = { localStorage, indexedDB, prefix, legacyKey: null };
  const store = new RecordStore(options); await store.load();
  localStorage.failAt = localStorage.operations + 1;
  assert.equal(await store.setMany([...fileCacheRecords(previous, []), ...valueRecords('groups', [])]), false);
  assert.ok(store.pending.size > 0);
  assert.ok([...indexedDB.databases.get('apple-word-trainer').keys()].some((key) => key.includes('__mirrorCleanup:')));
  const restored = (await new RecordStore(options).load()).entries;
  assert.deepEqual(readValue(restored, 'groups'), []);
  assert.deepEqual(readFileCache(restored), []);
  assert.ok(![...restored.keys()].some((key) => key.startsWith('file-cache:0') || key.startsWith('__mirrorCleanup:')));
  assert.equal(restored.get('unrelated'), 'keep');
  assert.equal(await store.flush(), true);
  assert.ok(![...localStorage.data.keys()].some((key) => key.startsWith(prefix + 'file-cache:0') || key.startsWith(prefix + 'groups')));
  assert.ok(![...indexedDB.databases.get('apple-word-trainer').keys()].some((key) => key.includes('__mirrorCleanup:')));
});

test('AUDIT-004/005: direct retry completes failed mirror cleanup without leaving journal records', async () => {
  const localStorage = new MemoryStorage(), indexedDB = new MemoryIndexedDB();
  const fallback = new RecordStore({ localStorage, indexedDB: null, legacyKey: null }); await fallback.load();
  await fallback.setMany(valueRecords('list', 'old'.repeat(3000)));
  const store = new RecordStore({ localStorage, indexedDB, legacyKey: null }); await store.load();
  localStorage.failAt = localStorage.operations + 1;
  assert.equal(await store.setMany(valueRecords('list', [])), false);
  assert.equal(await store.flush(), true);
  assert.ok(![...indexedDB.databases.get('apple-word-trainer').keys()].some((key) => key.includes('__mirrorCleanup:')));
  assert.ok(![...localStorage.data.keys()].some((key) => key.startsWith(PREFIX + 'list')));
});

test('AUDIT-009: Beijing midnight, recent day keys and streaks do not use the device timezone', () => {
  const originalTimezone = process.env.TZ;
  for (const timeZone of ['Asia/Shanghai', 'America/Los_Angeles', 'UTC']) {
    process.env.TZ = timeZone;
    assert.equal(progress.dayKey('2026-10-09T15:59:59Z'), '2026-10-09');
    assert.equal(progress.dayKey('2026-10-09T16:00:00Z'), '2026-10-10');
    assert.deepEqual(progress.recentDays(3, '2026-10-09T16:30:00Z'), ['2026-10-08', '2026-10-09', '2026-10-10']);
    assert.equal(progress.studyStreak({ '2026-10-08': { studied: 1 }, '2026-10-09': { studied: 1 } }, '2026-10-09T16:30:00Z'), 2);
  }
  if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone;
  assert.equal(progress.dayKey('invalid date'), '');
});

let server, apps;
const listeners = new Map();
const renderer = createRenderer({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} });
const mount = async (useApp) => {
  let app;
  const instance = renderer.createApp({ setup() { app = useApp(); return () => null; } });
  instance.mount({});
  for (let index = 0; index < 100 && !app.ready; index++) await new Promise(setImmediate);
  assert.equal(app.ready, true);
  return { app, close: () => instance.unmount() };
};
before(async () => {
  globalThis.window = { addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); }, removeEventListener(name, callback) { listeners.get(name)?.delete(callback); }, scrollTo() {} };
  globalThis.document = { querySelector: () => null };
  globalThis.speechSynthesis = { getVoices: () => [], cancel() {}, speak(utterance) { setImmediate(() => utterance.onend?.()); }, addEventListener() {}, removeEventListener() {} };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.Audio = class { constructor(src) { this.src = src; } play() { return Promise.resolve(); } pause() {} };
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  apps = {
    learning: (await server.ssrLoadModule('/src/useLearning.js')).useLearning,
    wordPlayer: (await server.ssrLoadModule('/src/word-player/useWordPlayer.js')).useWordPlayer,
    synonyms: (await server.ssrLoadModule('/src/synonyms/useSynonyms.js')).useSynonyms,
    listening: (await server.ssrLoadModule('/src/listening/useListening.js')).useListening,
  };
});
after(async () => { await server?.close(); });

test('AUDIT-001: adopting another page’s library preserves its existing word notes and difficulty', async () => {
  globalThis.indexedDB = null; globalThis.localStorage = new MemoryStorage();
  const first = await mount(apps.learning), second = await mount(apps.learning);
  try {
    const parsed = parseWordText('apple | 苹果\npear | 梨', 'a.txt');
    const library = await first.app.saveLibrary(parsed, 'A', 'a.txt');
    first.app.selectSource(library.id);
    first.app.adjustDifficulty(3); first.app.saveNote('already saved');
    await first.app.retrySave();
    await second.app.saveLibrary(parsed, 'B', 'b.txt');
    second.app.selectSource(library.id, false);
    assert.equal(second.app.currentRecord.difficulty, 3);
    assert.equal(second.app.currentRecord.note, 'already saved');
  } finally { first.close(); second.close(); }
});

test('AUDIT-009: new daily counts cross Beijing midnight without moving historical records', async (context) => {
  let clock = Date.parse('2026-10-09T15:59:59Z');
  context.mock.method(Date, 'now', () => clock);
  const options = storageOptions('localStorage');
  globalThis.localStorage = options.localStorage; globalThis.indexedDB = null;
  const store = new RecordStore(options); await store.load();
  const historical = { studied: 3, events: 4, mastered: 2, reviewed: 1, seen: '' };
  await store.set('day:2026-10-08', historical);
  const rawHistorical = options.localStorage.getItem(PREFIX + 'day:2026-10-08');
  const mounted = await mount(apps.learning);
  try {
    const app = mounted.app;
    app.now = Date.parse('2026-10-09T15:59:59Z'); app.move(1); app.move(-1);
    const before = app.days['2026-10-09'].studied;
    app.move(1); app.move(-1);
    assert.equal(app.days['2026-10-09'].studied, before);
    clock = Date.parse('2026-10-09T16:00:00Z'); app.now = clock; app.move(1);
    assert.ok(app.days['2026-10-10'].studied > 0);
    assert.equal(app.lastDays(7).at(-1).key, '2026-10-10');
    assert.equal(app.lastDays(30).length, 30);
    await app.retrySave();
    assert.equal(options.localStorage.getItem(PREFIX + 'day:2026-10-08'), rawHistorical);
  } finally { mounted.close(); }
});

test('AUDIT-003/006: rejected imports preserve the active library, cache and pending records', async () => {
  globalThis.localStorage = new MemoryStorage(); globalThis.indexedDB = null;
  const mounted = await mount(apps.synonyms);
  try {
    const app = mounted.app;
    await app.importFiles([file('good.txt', 'apple, pear')]);
    const groups = JSON.stringify(app.groups), cache = JSON.stringify(app.cachedFiles), original = new Map(globalThis.localStorage.data);
    const oversized = Array.from({ length: 51 }, () => Array(200).fill('a').join(',')).join('\n');
    for (const bad of [file('bad.txt', new Uint8Array([0xff])), file('dense.txt', 'a,'.repeat(1048576)), file('total.txt', oversized)]) {
      assert.equal(await app.importFiles([file('second.txt', 'plum, cherry'), bad]), false);
      assert.equal(JSON.stringify(app.groups), groups); assert.equal(JSON.stringify(app.cachedFiles), cache);
      assert.equal(app.pendingFiles, null); assert.deepEqual(globalThis.localStorage.data, original);
    }
    const groupsAtLimit = Array.from({ length: 50 }, () => Array(200).fill('a'));
    await app.setGroups(groupsAtLimit, 'limit');
    assert.equal(app.visibleWords(app.filteredGroups[0]).length, 50);
    app.jump(0, 155); await nextTick();
    assert.equal(app.groupPage(app.filteredGroups[0]), 3); assert.equal(app.current.word, 155);
    const boundaryText = groupsAtLimit.map((group) => group.join(',')).join('\n');
    await app.importFiles([file('limit.txt', boundaryText)]);
    const cachedBoundary = JSON.stringify(app.cachedFiles), activeBoundary = JSON.stringify(app.groups);
    assert.equal(await app.importFiles([file('extra.txt', 'extra')], ['limit.txt']), false);
    assert.equal(JSON.stringify(app.cachedFiles), cachedBoundary); assert.equal(JSON.stringify(app.groups), activeBoundary);
  } finally { mounted.close(); }
});

for (const mode of modes) {
  test(`AUDIT-004: listening ${mode} custom text shrink and clear remove tail chunks and survive failure`, async () => {
    const options = storageOptions(mode);
    globalThis.localStorage = options.localStorage; globalThis.indexedDB = options.indexedDB;
    const mounted = await mount(apps.listening);
    try {
      const app = mounted.app;
      app.customText = 'ability;'.repeat(1000); await app.saveCustom();
      if (mode === 'IndexedDB') options.indexedDB.failWrite = true; else options.localStorage.failAt = options.localStorage.operations + 2;
      app.customText = ''; assert.equal(await app.saveCustom(), false); assert.equal(await app.retrySave(), true);
      const entries = (await new RecordStore({ ...options, database: 'ielts-dictation-data-db', prefix: 'ielts-listening-v1:' }).load()).entries;
      assert.equal(entries.get('customParts'), 0);
      assert.equal([...entries.keys()].filter((key) => /^custom:\d+$/.test(key)).length, 0);
      const restored = await mount(apps.listening);
      assert.equal(restored.app.customText, ''); restored.close();
    } finally { mounted.close(); }
  });
}

for (const mode of modes) for (const module of ['wordPlayer', 'synonyms']) {
  test(`AUDIT-002: ${module} re-reads after initial ${mode} failure without writing default data`, async () => {
    const options = storageOptions(mode);
    const prefix = module === 'wordPlayer' ? 'ielts-word-player-v1:' : 'ielts-synonyms-v1:';
    const seed = new RecordStore({ ...options, prefix }); await seed.load();
    const prefs = module === 'wordPlayer' ? { rate: 1.4, repeat: 4, mode: 'dictation' } : { rate: 1.4, repeat: 5, groupLoops: 3 };
    const saved = module === 'wordPlayer' ? valueRecords('list', ['apple', 'pear']) : [...valueRecords('groups', [['apple', 'pear']]), ...fileCacheRecords([], updateFileCache([], [{ name: 'saved.txt', text: 'apple, pear', size: 11, groupCount: 1 }]))];
    await seed.setMany([['prefs', prefs], ...saved]);
    if (mode === 'IndexedDB') options.indexedDB.failRead = true; else options.localStorage.blocked = true;
    globalThis.localStorage = options.localStorage; globalThis.indexedDB = options.indexedDB;
    const mounted = await mount(apps[module]);
    try {
      assert.equal(mounted.app.storage.state, 'error'); assert.match(mounted.app.storage.message, /读取/);
      options.localStorage.blocked = false;
      assert.equal(await mounted.app.retrySave(), true); await nextTick();
      assert.equal(mounted.app.prefs.rate, 1.4); assert.equal(mounted.app.prefs.repeat, prefs.repeat);
      if (module === 'wordPlayer') assert.deepEqual([...mounted.app.items], ['apple', 'pear']);
      else { assert.deepEqual(mounted.app.groups.map((group) => [...group]), [['apple', 'pear']]); assert.equal(mounted.app.cachedFiles[0].name, 'saved.txt'); }
      assert.equal(mounted.app.playing, false); assert.equal(mounted.app.speaking, false);
      const reloaded = (await new RecordStore({ ...options, prefix }).load()).entries;
      assert.deepEqual(reloaded.get('prefs'), prefs);
    } finally { mounted.close(); }
  });
}

test('AUDIT-007: listening clears feedback on manual and automatic next questions, with answer deduplication', async () => {
  globalThis.indexedDB = null; globalThis.localStorage = new MemoryStorage();
  const OriginalAudio = globalThis.Audio, played = [];
  globalThis.Audio = class extends OriginalAudio { constructor(src) { super(src); played.push(this); } };
  const mounted = await mount(apps.listening);
  try {
    const app = mounted.app;
    app.prefs.interval = 0; app.start(); const first = app.current;
    app.answer = 'wrong'; app.submit(); app.submit();
    assert.equal(app.records.get(first.key).practiceCount, 1);
    app.next(); assert.equal(app.feedback, null); assert.equal(app.answer, ''); assert.equal(app.answered, false);
    app.reveal(); assert.equal(app.feedback.word, app.current.word);
    app.next(); assert.equal(app.feedback, null);
    app.answer = app.current.word; app.submit();
    await new Promise((resolve) => setTimeout(resolve, 380));
    assert.equal(app.feedback, null); assert.equal(app.answered, false);
    app.end(); app.prefs.interval = 0.01; app.start();
    const timedOut = app.current;
    const previousCount = app.records.get(timedOut.key)?.practiceCount || 0;
    played.at(-1).onended();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.notEqual(app.current.key, timedOut.key); assert.equal(app.feedback, null);
    assert.equal(app.records.get(timedOut.key).practiceCount, previousCount + 1); assert.equal(app.answered, false);
    app.togglePause(); app.replay(); assert.equal(app.feedback, null);
    app.end(); app.prefs.interval = 0; app.start();
    const total = app.session.items.length, firstWrong = app.current;
    const previousWrongCount = app.records.get(firstWrong.key)?.wrongCount || 0;
    for (let index = 0; index < total; index += 1) {
      app.answer = index ? app.current.word : 'wrong'; app.submit(); app.submit(); app.next();
      if (index + 1 < total) assert.equal(app.feedback, null);
    }
    assert.equal(app.status, 'finished'); assert.equal(app.scoreSummary.sessions, 1);
    assert.equal(app.scoreSummary.total, total); assert.equal(app.scoreSummary.correct, total - 1);
    assert.equal(app.records.get(firstWrong.key).wrongCount, previousWrongCount + 1);
    app.next(); assert.equal(app.scoreSummary.sessions, 1);
  } finally { mounted.close(); globalThis.Audio = OriginalAudio; }
});

for (const module of ['wordPlayer', 'synonyms']) {
  test(`AUDIT-008: ${module} ignores modified browser shortcuts and controls, while plain keys work`, async () => {
    globalThis.indexedDB = null; globalThis.localStorage = new MemoryStorage();
    const mounted = await mount(apps[module]);
    try {
      const app = mounted.app;
      if (module === 'wordPlayer') { app.rawText = 'apple, pear'; await app.loadWords(); }
      else await app.setGroups([['apple', 'pear']], 'test');
      for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
        let prevented = false;
        for (const key of ['r', 'ArrowRight', ' ']) for (const callback of listeners.get('keydown')) callback({ target: { closest: () => null }, key, code: key === ' ' ? 'Space' : '', [modifier]: true, preventDefault() { prevented = true; } });
        assert.equal(prevented, false); assert.equal(app.index, 0); assert.equal(app.speaking, false);
      }
      let prevented = false;
      for (const callback of listeners.get('keydown')) callback({ target: { closest: () => ({}) }, key: 'ArrowRight', preventDefault() { prevented = true; } });
      assert.equal(prevented, false); assert.equal(app.index, 0);
      for (const callback of listeners.get('keydown')) callback({ target: { closest: () => null }, key: 'ArrowRight', preventDefault() { prevented = true; } });
      assert.equal(prevented, true); assert.equal(app.index, 1); assert.equal(app.playing, false);
    } finally { mounted.close(); }
  });
}
