import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDifficulty, changeDifficulty, answerRecord, scheduleReview, isReviewDue, reviewIntervals } from '../src/learningModel.js';
import { RecordStore, wordRecords, PREFIX } from '../src/storage.js';

const now = Date.parse('2026-10-09T12:00:00Z');
const record = (difficulty = 0) => ({ difficulty, stage: 0, failures: 0, nextReviewAt: '', mastered: false, note: '' });

test('difficulty accepts only integers between zero and ten', () => {
  for (const [value, expected] of [[-1, 0], [0, 0], [4.8, 4], ['7', 7], [10, 10], [99, 10], [undefined, 0], ['invalid', 0], [Infinity, 0]]) {
    assert.equal(normalizeDifficulty(value), expected);
  }
});

test('manual difficulty changes saturate, schedule increases immediately, and clear the schedule at zero', () => {
  const word = { ...record(8), stage: 3, nextReviewAt: new Date(now + 86400000).toISOString() };
  assert.equal(changeDifficulty(word, 3, now), 2);
  assert.equal(word.difficulty, 10);
  assert.equal(word.stage, 0);
  assert.equal(word.nextReviewAt, new Date(now).toISOString());
  scheduleReview(word, true, now);
  const scheduled = word.nextReviewAt;
  assert.equal(changeDifficulty(word, 1, now), 0);
  assert.equal(word.nextReviewAt, scheduled);
  assert.equal(changeDifficulty(word, -1, now), -1);
  assert.equal(word.nextReviewAt, scheduled);
  assert.equal(changeDifficulty(word, -9, now), -9);
  assert.equal(word.stage, 0);
  assert.equal(word.nextReviewAt, '');
  assert.equal(isReviewDue(word, now), false);
  assert.equal(changeDifficulty(word, -1, now), 0);
});

test('a wrong answer adds three without a difficult flag and counts existing reviews only', () => {
  const fresh = record();
  assert.deepEqual(answerRecord(fresh, false, now), { reviewed: false, added: 3 });
  assert.equal(fresh.difficulty, 3);
  assert.equal(fresh.failures, 1);
  assert.equal(isReviewDue(fresh, now), true);
  assert.equal('difficult' in fresh, false);
  assert.deepEqual(answerRecord(fresh, false, now), { reviewed: true, added: 3 });
  assert.equal(fresh.difficulty, 6);
  assert.equal(fresh.failures, 2);
});

test('wrong answers at the ceiling become due and report the actual increase', () => {
  const word = { ...record(9), stage: 4, nextReviewAt: new Date(now + 86400000).toISOString() };
  assert.deepEqual(answerRecord(word, false, now), { reviewed: true, added: 1 });
  assert.equal(word.difficulty, 10);
  assert.equal(word.stage, 0);
  assert.equal(word.nextReviewAt, new Date(now).toISOString());
  scheduleReview(word, true, now);
  assert.deepEqual(answerRecord(word, false, now), { reviewed: true, added: 0 });
  assert.equal(word.difficulty, 10);
  assert.equal(word.failures, 2);
  assert.equal(isReviewDue(word, now), true);
});

test('correct answers retain difficulty, advance review intervals, and do not schedule zero difficulty', () => {
  const fresh = record();
  assert.deepEqual(answerRecord(fresh, true, now), { reviewed: false, added: 0 });
  assert.equal(fresh.nextReviewAt, '');
  const word = record(7);
  for (let index = 0; index < reviewIntervals.length + 2; index += 1) {
    assert.deepEqual(answerRecord(word, true, now), { reviewed: true, added: 0 });
    assert.equal(word.difficulty, 7);
    assert.equal(word.nextReviewAt, new Date(now + reviewIntervals[Math.min(index, reviewIntervals.length - 1)] * 3600000).toISOString());
    assert.equal(isReviewDue(word, now), false);
    assert.equal(isReviewDue(word, Date.parse(word.nextReviewAt)), true);
  }
  assert.equal(word.failures, 0);
});

test('difficulty, notes, and review progress round-trip through the existing record store without reading legacy data', async () => {
  const entries = new Map([['apple-word-trainer-v4', '{invalid legacy}']]);
  const localStorage = {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index],
    getItem: (key) => {
      assert.notEqual(key, 'apple-word-trainer-v4');
      return entries.get(key) ?? null;
    },
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const store = new RecordStore({ indexedDB: null, localStorage, legacyKey: null });
  await store.load();
  const word = { ...record(6), note: '容易混淆的搭配', mastered: true };
  answerRecord(word, true, now);
  assert.equal(await store.setMany(wordRecords('sample', word)), true);
  const loaded = await new RecordStore({ indexedDB: null, localStorage, legacyKey: null }).load();
  const saved = loaded.entries.get('word:sample');
  assert.equal(saved.difficulty, 6);
  assert.equal(saved.mastered, true);
  assert.equal(saved.stage, 1);
  assert.equal(saved.nextReviewAt, word.nextReviewAt);
  assert.equal(loaded.entries.get('note:sample:0'), word.note);
  assert.equal('difficult' in JSON.parse(entries.get(PREFIX + 'word:sample')).value, false);
  assert.equal(loaded.legacy, null);
  assert.equal(entries.get('apple-word-trainer-v4'), '{invalid legacy}');
});
