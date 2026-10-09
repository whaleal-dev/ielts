import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addScore, audioFilename, audioUrl, buildLibrary, displayWord, emptyRecord, formatWords, hydrateLegacy, isFullGroup, LISTENING_PREFIX, localDay, recordAnswer, resolveInput, sanitizePrefs } from '../src/listening/model.js';
import { AudioPlayer } from '../src/listening/player.js';
import { createListeningStore, legacyKeys, readLegacy } from '../src/listening/storage.js';
import { byteSize, PREFIX, RECORD_LIMIT, RecordStore } from '../src/storage.js';

const library = buildLibrary({
  31: { id: '31', title: 'Chapter 3 名词：Test Paper 1', words: ['ability', 'abstract', 'ability', 'sea otter'], directory: 'assets/audio/31', encoding: 'plus', missing: ['sea otter'] },
  32: { id: '32', title: 'Chapter 3 名词：Test Paper 2', words: ['ability', 'actor'], directory: 'assets/audio/32', encoding: 'plus' },
  1104: { id: '1104', title: 'Chapter 11 Section 4', words: ['actor&#37413;&#27290; delivery'], directory: 'assets/audio/1104', encoding: 'plus', overrides: { 'actor&#37413;&#27290; delivery': "chunks/section4/actor's_delivery.mp3" } },
});
class MemoryStorage {
  constructor() { this.entries = new Map(); this.fail = false; }
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index]; }
  getItem(key) { return this.entries.get(key) ?? null; }
  removeItem(key) { this.entries.delete(key); }
  setItem(key, value) { if (this.fail) throw new DOMException('Full', 'QuotaExceededError'); this.entries.set(key, value); }
}

test('HTML corpus extraction preserves all 88 groups and 9366 original entries', async () => {
  const corpus = JSON.parse(await readFile(new URL('../listening-word/data/corpus.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(corpus).length, 88);
  assert.equal(Object.values(corpus).reduce((sum, group) => sum + group.words.length, 0), 9366);
  assert.equal(Object.values(corpus).reduce((sum, group) => sum + new Set(group.words.map((word) => word.trim().toLowerCase().replace(/\s+/g, ' '))).size, 0), 9330);
  assert.equal(corpus['811'].words.includes('thank you'), false);
  assert.equal(corpus['1104'].words.includes('actor&#37413;&#27290; delivery'), true);
});

test('input resolves duplicates, wrong groups and missing audio without counting them as answers', () => {
  const result = resolveInput(library, ' Ability \nABILITY\nabstract\nactor\nunknown\nsea otter', '31');
  assert.deepEqual(result.items.map((word) => word.word), ['ability', 'abstract']);
  assert.deepEqual(result.missing, ['unknown']);
  assert.deepEqual(result.mismatch, ['actor']);
  assert.deepEqual(result.unavailable, ['sea otter']);
  assert.equal(isFullGroup(result.items, library.groups[0]), false);
  assert.deepEqual(resolveInput(library, '', '31').items, []);
  assert.equal(library.byText.get('ability').length, 2);
  assert.notEqual(library.byText.get('ability')[0].key, library.byText.get('ability')[1].key);
  assert.equal(isFullGroup(library.groups[1].items, library.groups[1]), true);
  assert.equal(isFullGroup([library.groups[1].items[0], library.groups[1].items[0]], library.groups[1]), false);
});

test('multiple words per line retain phrase spaces, duplicates and group validation', () => {
  const result = resolveInput(library, ' Ability； abstract; ABILITY\r\nactor；unknown； sea otter ', '31');
  assert.deepEqual(result.items.map((word) => word.word), ['ability', 'abstract']);
  assert.deepEqual(result.missing, ['unknown']);
  assert.deepEqual(result.mismatch, ['actor']);
  assert.deepEqual(result.unavailable, ['sea otter']);
  assert.deepEqual(resolveInput(library, "actor&#37413;&#27290; delivery； actor's delivery").items.map((word) => word.word), ["actor's delivery"]);
  assert.equal(isFullGroup(resolveInput(library, 'ability； actor', '32').items, library.groups[1]), true);
});

test('comma separators support mixed input, empty entries, phrases and group validation', () => {
  const result = resolveInput(library, ' , Ability, abstract，ABILITY；actor,unknown\nsea otter，, ', '31');
  assert.deepEqual(result.items.map((word) => word.word), ['ability', 'abstract']);
  assert.deepEqual(result.missing, ['unknown']);
  assert.deepEqual(result.mismatch, ['actor']);
  assert.deepEqual(result.unavailable, ['sea otter']);
  assert.equal(isFullGroup(resolveInput(library, 'ability，actor', '32').items, library.groups[1]), true);
  assert.deepEqual(resolveInput(library, "actor&#37413;&#27290; delivery, actor's delivery").items.map((word) => word.word), ["actor's delivery"]);
  assert.deepEqual(resolveInput(library, ',，;；\n').items, []);
});

test('compact lists preserve every corpus entry, including phrases and internal commas', async () => {
  const corpus = JSON.parse(await readFile(new URL('../listening-word/data/corpus.json', import.meta.url), 'utf8'));
  const fullLibrary = buildLibrary(Object.fromEntries(Object.entries(corpus).map(([id, group]) => [id, { ...group, id }])));
  for (const group of fullLibrary.groups) {
    const words = group.items.map((word) => word.word);
    for (const raw of [formatWords(words), words.join(', '), words.join('，')]) {
      const result = resolveInput(fullLibrary, raw, group.id);
      assert.deepEqual(result.items.map((word) => word.key), group.items.map((word) => word.key));
      assert.equal(isFullGroup(result.items, group), true);
      assert.deepEqual(result.missing, []);
      assert.deepEqual(result.mismatch, []);
    }
  }
});

test('current word and progress visibility restore independently and retain old preferences', () => {
  const defaults = sanitizePrefs({}, library.groups);
  assert.equal(defaults.showCurrentWord, false);
  assert.equal(defaults.progressExpanded, true);
  const old = sanitizePrefs({ showWords: true }, library.groups);
  assert.equal(old.showCurrentWord, true);
  assert.equal(old.progressExpanded, true);
  for (const showCurrentWord of [false, true]) {
    for (const progressExpanded of [false, true]) {
      const prefs = sanitizePrefs({ showCurrentWord, progressExpanded, showWords: !showCurrentWord }, library.groups);
      assert.equal(prefs.showCurrentWord, showCurrentWord);
      assert.equal(prefs.showWords, !showCurrentWord);
      assert.equal(prefs.progressExpanded, progressExpanded);
    }
  }
  const invalid = sanitizePrefs({ showCurrentWord: 'true', progressExpanded: 'false' }, library.groups);
  assert.equal(invalid.showCurrentWord, false);
  assert.equal(invalid.progressExpanded, true);
});

test('listening repeats and loops accept positive integers above 20 and normalize invalid values', () => {
  for (const [input, expected] of [[21, 21], ['999', 999], [0, 1], [-4, 1], [2.9, 2], ['', 1], ['invalid', 1], [Infinity, 1], [NaN, 1], [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]]) {
    const prefs = sanitizePrefs({ repeat: input, loops: input }, library.groups);
    assert.equal(prefs.repeat, expected);
    assert.equal(prefs.loops, expected);
  }
});

test('audio URLs encode actual filenames, plus signs and Chapter 8 directories once', () => {
  assert.equal(audioFilename('a pair of glasses', 'plus'), 'a+pair+of+glasses.mp3');
  assert.equal(audioFilename('joining fee(s)', 'plus'), 'joining+fee%28s%29.mp3');
  assert.equal(audioFilename('6212 6611', 'underscore'), '6212_6611.mp3');
  assert.equal(audioUrl('assets/audio/31/a+pair%28s%29.mp3'), '/listening-word/assets/audio/31/a+pair%2528s%2529.mp3');
  assert.equal(audioUrl('chapter8/intro,_lesson.mp3'), '/listening-word/chapter8/intro,_lesson.mp3');
  assert.match(audioUrl('chapter8/1 number/01_Test基本语料_chunks/6212_6611.mp3'), /1%20number/);
  assert.equal(displayWord('actor&#37413;&#27290; delivery'), "actor's delivery");
  assert.match(resolveInput(library, "actor's delivery").items[0].audio, /actor's_delivery/);
});

test('wrong answers preserve bounded recent answers and error levels; correct answers leave wrong history intact', () => {
  let record = emptyRecord();
  for (let index = 0; index < 100; index += 1) record = recordAnswer(record, '中'.repeat(10000), false, index + 1);
  record = recordAnswer(record, 'ability', true);
  assert.equal(record.practiceCount, 101);
  assert.equal(record.correctCount, 1);
  assert.equal(record.wrongCount, 100);
  assert.equal(record.errorLevel, 10);
  assert.equal(record.recentAnswers.length, 5);
  assert.equal(record.recentAnswers[0].length, 400);
  assert.ok(byteSize({ key: LISTENING_PREFIX + 'word:31::ability', at: Date.now(), value: record }) < RECORD_LIMIT);
});

test('legacy records hydrate without mutating originals and new records keep a separate namespace', async () => {
  const storage = new MemoryStorage();
  const legacy = { settings: { chapter: '32', mode: 'listen', interval: '0', listenRepeat: '2' }, wordStats: { '31::ability': { practiceCount: 6, correctCount: 4 } }, mistakes: [{ chapterId: '31', word: 'ability', wrongCount: 2, lastAnswer: 'abilty', lastWrongAt: 100 }], chapterStats: { 31: [{ timestamp: Date.parse('2026-10-07T00:00:00Z'), correct: 2, total: 3 }] } };
  for (const [name, key] of Object.entries(legacyKeys)) storage.setItem(key, JSON.stringify(legacy[name]));
  const original = structuredClone([...storage.entries]);
  const store = createListeningStore({ indexedDB: null, localStorage: storage });
  await store.load();
  const loaded = hydrateLegacy(await readLegacy(store), library);
  assert.equal(loaded.records.get('31::ability').errorLevel, 6);
  assert.equal(loaded.records.get('31::ability').practiceCount, 6);
  assert.equal(loaded.records.get('31::ability').correctCount, 4);
  assert.deepEqual(loaded.records.get('31::ability').recentAnswers, ['abilty']);
  assert.equal(loaded.prefs.interval, 0);
  assert.equal(loaded.prefs.mode, 'listen');
  assert.equal(loaded.scores.get('31:2026-10-07').sessions, 1);
  await store.set('word:31::ability', { ...loaded.records.get('31::ability'), errorLevel: 0 });
  assert.deepEqual([...storage.entries].filter(([key]) => !key.startsWith(LISTENING_PREFIX)), original);
  const wordsStore = new RecordStore({ indexedDB: null, localStorage: storage });
  assert.equal((await wordsStore.load()).entries.size, 0);
  await wordsStore.set('prefs', { view: 'study' });
  assert.ok(storage.getItem(PREFIX + 'prefs'));
  assert.equal((await createListeningStore({ indexedDB: null, localStorage: storage }).load()).entries.get('word:31::ability').errorLevel, 0);
});

test('listening quota failures retain the newest pending record and can retry', async () => {
  const storage = new MemoryStorage();
  const store = createListeningStore({ indexedDB: null, localStorage: storage });
  await store.load();
  storage.fail = true;
  assert.equal(await store.set('word:31::ability', recordAnswer(emptyRecord(), 'abilty', false)), false);
  assert.equal(store.pending.size, 1);
  storage.fail = false;
  assert.equal(await store.flush(), true);
  assert.equal(JSON.parse(storage.getItem(LISTENING_PREFIX + 'word:31::ability')).value.wrongCount, 1);
});

test('daily chapter aggregation stays small after repeated sessions and uses Shanghai dates', () => {
  let score;
  for (let index = 0; index < 10000; index += 1) score = addScore(score, 100, 120, 1791331200000);
  assert.equal(score.sessions, 10000);
  assert.equal(score.correct, 1000000);
  assert.equal(score.total, 1200000);
  assert.ok(byteSize(score) < 256);
  assert.equal(localDay('2026-10-06T16:01:00Z'), '2026-10-07');
  const prefs = sanitizePrefs({ repeat: 999, loops: -4, interval: 'bad', rate: 0.1, view: 'invalid' }, library.groups);
  assert.equal(prefs.repeat, 999);
  assert.equal(prefs.loops, 1);
  assert.equal(prefs.interval, 2);
  assert.equal(prefs.rate, 0.4);
  assert.equal(prefs.view, 'practice');
});

test('player repeats, pauses and ignores ended events from replaced audio', async () => {
  const audios = [];
  const createAudio = () => { const audio = { plays: 0, pauses: 0, currentTime: 0, play() { this.plays += 1; return Promise.resolve(); }, pause() { this.pauses += 1; } }; audios.push(audio); return audio; };
  const player = new AudioPlayer({ createAudio });
  let ended = 0;
  player.play('/first.mp3', { rate: 0.8, repeat: 2, onEnd: () => ended += 1 });
  await new Promise(setImmediate);
  assert.equal(audios[0].playbackRate, 0.8);
  audios[0].onended(); await new Promise(setImmediate);
  assert.equal(audios[0].plays, 2);
  player.pause(); assert.equal(player.paused, true);
  player.resume(); await new Promise(setImmediate);
  assert.equal(audios[0].plays, 3);
  const staleEnd = audios[0].onended;
  player.play('/second.mp3', { onEnd: () => ended += 1 });
  staleEnd(); assert.equal(ended, 0);
  audios[1].onended(); assert.equal(ended, 1);
  player.stop(); assert.equal(audios[1].onended, null);
});
