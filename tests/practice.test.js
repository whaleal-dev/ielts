import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroups, groupQueue, synonymPrefs } from '../src/synonyms/model.js';
import { parseWords, matchesAnswer, shuffleWords, wordPlayerPrefs } from '../src/word-player/model.js';
import { readValue, valueRecords } from '../src/practice/records.js';
import { QueuePlayer, SpeechPlayer } from '../src/practice/player.js';
import { byteSize, RecordStore } from '../src/storage.js';

test('synonym imports preserve phrases, Chinese labels and file order while rejecting malformed data', () => {
  assert.deepEqual(parseGroups('\uFEFFreserve, book，预订\r\n\r\nin advance, ahead', 'a.TXT'), [['reserve', 'book', '预订'], ['in advance', 'ahead']]);
  assert.deepEqual(parseGroups('[[" fee ","cost",""],[],["price"]]', 'b.JSON'), [['fee', 'cost'], ['price']]);
  for (const text of ['{}', '["word"]', '[[1,"word"]]', '[]', '[[]]', 'invalid']) assert.throws(() => parseGroups(text, 'bad.json'));
  assert.throws(() => parseGroups('  \n，,', 'blank.txt'));
  assert.throws(() => parseGroups('word', 'unsupported.csv'));
  assert.throws(() => parseGroups('x'.repeat(201), 'long.txt'));
});

test('group loops stay within each group and skip Chinese without losing original highlight positions', () => {
  const items = groupQueue([{ index: 7, words: ['预订', 'reserve', 'book'] }, { index: 10, words: ['ahead', '提前'] }], 2);
  assert.deepEqual(Array.from(items, (item) => item.text), ['reserve', 'book', 'reserve', 'book', 'ahead', 'ahead']);
  assert.deepEqual(Array.from(items, (item) => [item.group, item.word, item.cycle]), [[7, 1, 1], [7, 2, 1], [7, 1, 2], [7, 2, 2], [10, 0, 1], [10, 0, 2]]);
  assert.equal(groupQueue([{ index: 0, words: ['中文', '中文词组'] }], 3).length, 0);
});

test('word lists filter Chinese, deduplicate case and whitespace, and leave valid English phrases intact', () => {
  assert.deepEqual(parseWords('Analyze, analyze，中文\r\nin advance\nIN   ADVANCE\nbeneficial,𐀀'), { items: ['Analyze', 'in advance', 'beneficial', '𐀀'], chinese: 1, duplicates: 2 });
  for (const text of ['', ' \r\n，,', '单词,词组', 'x'.repeat(201)]) assert.throws(() => parseWords(text));
  assert.equal(matchesAnswer('  In   Advance ', 'in advance'), true);
  assert.equal(matchesAnswer('', 'advance'), false);
  assert.equal(matchesAnswer('advanced', 'advance'), false);
  const original = ['a', 'b', 'c'];
  assert.deepEqual(shuffleWords(original, () => 0), ['b', 'c', 'a']);
  assert.deepEqual(original, ['a', 'b', 'c']);
});

test('settings enforce playback boundaries and read reference-page settings without changing them', () => {
  const legacy = { selectedVoiceURI: 'British', speechRate: '1.2', repeatCount: '3', ttsSource: 'baidu', dictationMode: true };
  const original = JSON.stringify(legacy);
  assert.deepEqual(wordPlayerPrefs(legacy), { voice: 'British', rate: 1.2, repeat: 3, interval: 1.5, source: 'web', mode: 'dictation' });
  assert.equal(wordPlayerPrefs({ source: 'baidu' }).source, 'web');
  assert.equal(JSON.stringify(legacy), original);
  assert.deepEqual(wordPlayerPrefs({ rate: 7, repeat: 99, interval: -1, source: 'unknown', mode: 'unknown' }), { voice: '', rate: 1.5, repeat: 5, interval: 0.5, source: 'web', mode: 'listen' });
  assert.deepEqual(synonymPrefs({ rate: 9, repeat: 4, groupLoops: 99, interval: -1 }), { voice: '', rate: 2, repeat: 2, groupLoops: 1, interval: 0, centerCurrent: false });
  assert.equal(synonymPrefs().centerCurrent, false);
  assert.equal(synonymPrefs({ centerCurrent: true }).centerCurrent, true);
  for (const centerCurrent of ['true', 1, null]) assert.equal(synonymPrefs({ centerCurrent }).centerCurrent, false);
});

test('large imported libraries and old notes round-trip through records below 8 KiB; smaller replacements ignore stale chunks', async () => {
  const groups = Array.from({ length: 1600 }, (_, index) => [`word ${index}`, `phrase ${index}`, '中文说明']);
  const note = ('长笔记\\\n😄').repeat(2000);
  const source = ('很长的词库文件名.json、').repeat(1000);
  const records = [...valueRecords('groups', groups), ...valueRecords('note:reserve', note), ...valueRecords('source', source)];
  const fakeStorage = { setItem() {}, getItem() { return null; } };
  const store = new RecordStore({ indexedDB: null, localStorage: fakeStorage, prefix: 'ielts-synonyms-v1:', legacyKey: null });
  await store.open();
  assert.equal(await store.setMany(records), true);
  assert.ok([...store.saved].every(([key, entry]) => byteSize({ key, ...entry }) <= 8192));
  const entries = new Map(records);
  assert.deepEqual(readValue(entries, 'groups', null), groups);
  assert.equal(readValue(entries, 'note:reserve', ''), note);
  assert.equal(readValue(entries, 'source', ''), source);
  valueRecords('groups', []).forEach(([key, value]) => entries.set(key, value));
  assert.deepEqual(readValue(entries, 'groups', null), []);
  entries.delete('note:reserve:0');
  assert.equal(readValue(entries, 'note:reserve', 'missing'), 'missing');
});

test('speech cancellation resolves the previous request and stale completion cannot finish its replacement', async () => {
  const utterances = [];
  const synthesis = { getVoices: () => [{ name: 'American', voiceURI: 'us', lang: 'en-US' }, { name: 'British', voiceURI: 'uk', lang: 'en-GB' }], speak: (utterance) => utterances.push(utterance), cancel() {} };
  const player = new SpeechPlayer({ synthesis, createUtterance: (text) => ({ text }) });
  const first = player.play('reserve'); const oldEnd = utterances[0].onend;
  assert.equal(utterances[0].voice.voiceURI, 'uk');
  const second = player.play('book', { voice: 'us', rate: 0.7 });
  assert.equal(await first, false);
  oldEnd();
  assert.equal(utterances[1].voice.voiceURI, 'us'); assert.equal(utterances[1].rate, 0.7);
  utterances[1].onend(); assert.equal(await second, true);
  const failed = player.play('fail'); utterances[2].onerror(); await assert.rejects(failed, /Web 语音/);
});

test('queue repeats before advancing, finishes once, and single-word dictation never advances automatically', async () => {
  const spoken = [], positions = [], states = [];
  const speech = { stop() {}, async play(text) { spoken.push(text); return true; } };
  const player = new QueuePlayer({ speech, onPosition: (index) => positions.push(index), onState: (state) => states.push(state) });
  await player.start([{ text: 'reserve' }, { text: 'book' }], 0, { repeat: 2, interval: 0 });
  assert.deepEqual(spoken, ['reserve', 'reserve', 'book', 'book']);
  assert.deepEqual(positions, [0, 1]);
  assert.equal(states.filter((state) => state.finished).length, 1);
  spoken.length = 0; positions.length = 0;
  await player.start([{ text: 'reserve' }, { text: 'book' }], 0, { repeat: 2, autoAdvance: false });
  assert.deepEqual(spoken, ['reserve', 'reserve']); assert.deepEqual(positions, [0]);
  assert.equal(states.at(-1).finished, false);
});

test('manual navigation during speech keeps automatic playback off, then explicit playback can advance', async () => {
  const state = { playing: false, speaking: false }, spoken = [], positions = [];
  let finish;
  const speech = {
    stop() { const cancel = finish; finish = null; cancel?.(false); },
    play(text) { spoken.push(text); return new Promise((resolve) => { finish = resolve; }); },
  };
  const player = new QueuePlayer({ speech, onPosition: (index) => positions.push(index), onState: (change) => Object.assign(state, change) });
  const items = [{ text: 'reserve' }, { text: 'book' }, { text: 'prebook' }];
  const first = player.start(items, 0, { autoAdvance: false });
  const automatic = state.playing;
  const second = player.start(items, 1, { autoAdvance: automatic });
  const duringSpeech = { ...state };
  const staleEnd = finish;
  player.stop(); await Promise.all([first, second]); staleEnd(true);
  assert.equal(automatic, false);
  assert.equal(duringSpeech.playing, false); assert.equal(duringSpeech.speaking, true);
  assert.deepEqual(spoken, ['reserve', 'book']); assert.deepEqual(positions, [0, 1]);
  assert.equal(state.playing, false); assert.equal(state.speaking, false);

  const manual = player.start(items, 1, { autoAdvance: false });
  finish(true); await manual;
  assert.deepEqual(positions, [0, 1, 1]); assert.equal(state.playing, false); assert.equal(state.finished, false);
  speech.play = async (text) => { spoken.push(text); return true; };
  await player.start(items, 1, { autoAdvance: true });
  assert.deepEqual(positions, [0, 1, 1, 1, 2]); assert.equal(state.finished, true);
});

test('dictation distinguishes manual speech from explicit playback and explicit playback remains pausable', async () => {
  const state = { playing: false, speaking: false }, spoken = [], positions = [];
  let finish;
  const speech = {
    stop() { const cancel = finish; finish = null; cancel?.(false); },
    play(text) { spoken.push(text); return new Promise((resolve) => { finish = resolve; }); },
  };
  const player = new QueuePlayer({ speech, onPosition: (index) => positions.push(index), onState: (change) => Object.assign(state, change) });
  const items = [{ text: 'reserve' }, { text: 'book' }];
  const manual = player.start(items, 0, { automatic: false, autoAdvance: false, repeat: 2 });
  const manualState = { ...state };
  player.stop(); await manual;
  assert.equal(manualState.playing, false); assert.equal(manualState.speaking, true);
  const explicit = player.start(items, 0, { automatic: true, autoAdvance: false, repeat: 2 });
  assert.equal(state.playing, true); assert.equal(state.speaking, true);
  player.stop(); await explicit;
  assert.equal(state.playing, false); assert.equal(state.speaking, false);
  speech.play = async (text) => { spoken.push(text); return true; };
  await player.start(items, 0, { automatic: true, autoAdvance: false, repeat: 2 });
  assert.deepEqual(spoken, ['reserve', 'reserve', 'reserve', 'reserve']);
  assert.deepEqual(positions, [0, 0, 0]); assert.equal(state.finished, false);
});

test('pausing during an interval cancels pending advancement and an audio failure stops the queue', async () => {
  const spoken = [], errors = [];
  const player = new QueuePlayer({ speech: { stop() {}, async play(text) { spoken.push(text); return true; } }, onError: (error) => errors.push(error.message) });
  const running = player.start([{ text: 'a' }, { text: 'b' }], 0, { interval: 1 });
  await new Promise(setImmediate); player.stop(); await running;
  assert.deepEqual(spoken, ['a']);
  player.speech.play = async () => { throw new Error('audio failed'); };
  await player.start([{ text: 'a' }, { text: 'b' }], 0);
  assert.deepEqual(errors, ['audio failed']);
});

test('removed Baidu settings use Web speech with the selected rate, and missing speech support fails clearly', async () => {
  let utterance;
  const synthesis = { getVoices: () => [], speak: (value) => { utterance = value; }, cancel() {} };
  const player = new SpeechPlayer({ synthesis, createUtterance: (text) => ({ text }) });
  const complete = player.play('environment', { source: 'baidu', rate: 1.25 });
  assert.equal(utterance.text, 'environment'); assert.equal(utterance.rate, 1.25); assert.equal(utterance.lang, 'en-GB');
  utterance.onend(); assert.equal(await complete, true);
  await assert.rejects(new SpeechPlayer({ synthesis: null }).play('word'), /不支持 Web 语音/);
});
