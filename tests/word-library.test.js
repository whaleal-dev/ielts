import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWordText, parseWordBytes, validateWordFile, MAX_FILE_BYTES, templates } from '../src/wordImport.js';
import { createWordLibrary, expandWordLibrary, directoryRecords, wordLibraryRecords, readWordLibraries, libraryDeleteKeys } from '../src/wordLibraries.js';
import { RecordStore, PREFIX, RECORD_LIMIT, wordRecords } from '../src/storage.js';
import { markStudied, emptyDay } from '../src/progress.js';
import { chooseEnglishVoice, SpeechPlayer } from '../src/practice/player.js';

test('CSV handles reordered headers, BOM, quoted commas, escaped quotes and multiline physical line numbers', () => {
  const result = parseWordText('\uFEFF释义,分组,单词,音标\r\n"n. 环境, 条件",环境,Environment,/test/\r\n"参加\r\n活动 ""示例""",词组,take part in,\r\n', 'words.csv');
  assert.equal(result.count, 2); assert.equal(result.words[1].line, 3);
  assert.equal(result.words[1].meaning, '参加\n活动 "示例"');
  assert.equal(result.words[1].word, 'take part in'); assert.equal(result.words[0].word, 'Environment');
  assert.throws(() => parseWordText('单词,释义\nword,"跨\n行"\nnext,\n', 'a.csv'), (error) => error.errors[0].line === 4 && error.errors[0].field === '释义');
});

test('invalid headers, quotes, row lengths, empty files and invalid words reject the entire file', () => {
  for (const text of ['单词,音标\nword,/w/', '单词,释义,释义\nword,词,词', '单词,释义,音频\nword,词,http://a', '单词,释义\nword,"未闭合', '单词,释义\nword,"词"oops', '单词,释义\nwo"rd,词', '单词,释义\nword,词,额外', '单词,释义\n测试,词', '单词,释义\ntest测试,词', '单词,释义\n,词', '单词,释义\nword,', '单词,释义\n', '']) assert.throws(() => parseWordText(text, 'a.csv'));
  for (const text of ['word', 'word | 词 | | 组 | 额外', '测试 | 中文', 'word | ', ' | 释义']) assert.throws(() => parseWordText(text, 'a.txt'));
});

test('TXT preserves phrases and deduplicates only identical entries in the same group', () => {
  const result = parseWordText("\n Take   part in | 参加 | /a/ | 词组\r\ntake part in | 参加 | /a/ | 词组\r\ntake part in | 参与 | /a/ | 词组\r\ntake part in | 参加 | /b/ | 词组\r\ntake part in | 参加 | /a/ | 其他\r\nactor’s delivery | 讲话\r\nACTOR'S DELIVERY | 讲话\r\n", 'a.txt');
  assert.equal(result.count, 5); assert.equal(result.duplicates, 2);
  assert.deepEqual(result.groups.map((group) => group.title), ['词组', '其他', '未分组']);
  assert.equal(result.words[0].word, 'Take   part in'); assert.equal(result.groups[2].words[0].phonetic, '');
});

test('automatic groups follow deduplicated order in blocks of fifty while named groups stay intact', () => {
  const lines = Array.from({ length: 101 }, (_, index) => `word${index} | 词${index}`);
  const result = parseWordText([lines[0], ...lines].join('\n'), 'a.txt');
  assert.deepEqual(result.groups.map((group) => [group.title, group.words.length]), [['第 1 组', 50], ['第 2 组', 50], ['第 3 组', 1]]);
  assert.equal(parseWordText(lines.map((line) => line + ' | | 用户分组').join('\n'), 'a.txt').groups.length, 1);
});

test('UTF-8 decoding and exact two MiB and five thousand unique word limits are enforced', () => {
  assert.throws(() => parseWordBytes(new Uint8Array([0xff, 0xfe]), 'a.txt'), /UTF-8/);
  const boundary = new Uint8Array(MAX_FILE_BYTES).fill(32); boundary.set(new TextEncoder().encode('word | 释义'));
  assert.equal(parseWordBytes(boundary, 'a.txt').count, 1);
  assert.throws(() => parseWordBytes(new Uint8Array(MAX_FILE_BYTES + 1), 'a.txt'), /2 MB/);
  for (const filename of ['a.json', 'a.xlsx', 'a.pdf']) assert.throws(() => validateWordFile(filename, 1));
  const lines = Array.from({ length: 5000 }, (_, index) => `word${index} | 词`);
  assert.equal(parseWordText([...lines, lines[0]].join('\n'), 'a.txt').count, 5000);
  assert.throws(() => parseWordText([...lines, 'word5000 | 词'].join('\n'), 'a.txt'), /5000/);
});

test('both download templates resolve to the same words and groups through the actual parser', () => {
  const values = (template) => parseWordText(template.content, template.filename).groups.map((group) => ({ ...group, words: group.words.map(({ line, ...word }) => word) }));
  assert.deepEqual(values(templates[0]), values(templates[1]));
});

test('library IDs do not depend on the secure-context randomUUID API', () => {
  const parsed = parseWordText('word | 词', 'a.txt');
  const first = createWordLibrary(parsed, '词库', []), second = createWordLibrary(parsed, '词库', []);
  assert.match(first.id, /^[a-f0-9]{32}$/); assert.notEqual(first.id, second.id);
});

function memoryStorage() {
  const items = new Map();
  return { items, failing: false, get length() { return items.size; }, key(index) { return [...items.keys()][index]; }, getItem(key) { return items.get(key) ?? null; }, removeItem(key) { items.delete(key); }, setItem(key, value) { if (this.failing) throw new DOMException('Full', 'QuotaExceededError'); items.set(key, value); } };
}

test('same-name libraries preserve independent stable keys, long fields and bounded records after reload', async () => {
  const parsed = parseWordText('word | ' + '含中文释义😀'.repeat(4000), 'a.txt'), title = '长名称😀'.repeat(3000);
  const first = expandWordLibrary(createWordLibrary(parsed, title, [], { id: 'first', createdAt: '2026-10-09T01:00:00Z' }), () => '/local.mp3');
  const second = expandWordLibrary(createWordLibrary(parsed, title, [first.title], { id: 'second', createdAt: '2026-10-09T02:00:00Z' }), () => '');
  assert.equal(second.title, title + '（2）'); assert.notEqual(first.words[0].key, second.words[0].key);
  const storage = memoryStorage(), store = new RecordStore({ indexedDB: null, localStorage: storage, legacyKey: null }); await store.load();
  assert.equal(await store.commit([...directoryRecords([second, first]), ...wordLibraryRecords(first), ...wordLibraryRecords(second)]), true);
  await store.setMany(wordRecords(first.words[0].key, { count: 2, note: '单独笔记', difficulty: 4 }));
  const { entries } = await new RecordStore({ indexedDB: null, localStorage: storage, legacyKey: null }).load();
  const recovered = readWordLibraries(entries, () => '/local.mp3');
  assert.deepEqual(recovered.map((library) => library.id), ['second', 'first']);
  assert.equal(recovered[1].words[0].meaning, first.words[0].meaning); assert.equal(recovered[1].words[0].key, first.words[0].key);
  assert.equal(entries.get(`word:${first.words[0].key}`).difficulty, 4);
  assert.ok(store.sizes().largest <= RECORD_LIMIT);
  assert.throws(() => createWordLibrary(parsed, '  ', []));
});

test('failed imports remain isolated from ordinary saves and can be retried without changing the directory', async () => {
  const storage = memoryStorage(), store = new RecordStore({ indexedDB: null, localStorage: storage, legacyKey: null }); await store.load();
  await store.set('prefs', { source: 'all' }); storage.failing = true;
  assert.equal(await store.commit([['libraries', { parts: 1 }], ['libraries:0', '["new"]']]), false);
  assert.equal(store.pending.size, 0); assert.equal(storage.getItem(PREFIX + 'libraries'), null);
  storage.failing = false; await store.set('prefs', { source: 'all', mode: 'quiz' });
  assert.equal(storage.getItem(PREFIX + 'libraries'), null);
  assert.equal(await store.commit([['libraries', { parts: 1 }], ['libraries:0', '["new"]']]), true);
});

test('deletion clears only the target content, notes and positions and preserves daily totals after failure and retry', async () => {
  const storage = memoryStorage(), store = new RecordStore({ indexedDB: null, localStorage: storage, legacyKey: null }); await store.load();
  const data = [['library:a', { parts: 1 }], ['library:a:0', '[]'], ['word:personal:a:w0', { difficulty: 3 }], ['note:personal:a:w0:0', '笔记'], ['position:personal:a:g0', 0], ['libraryPosition:a', { group: 'personal:a:g0' }], ['libraryDay:a:2026-10-09', { studied: 1 }], ['library:ab', { parts: 1 }], ['library:ab:0', '其他'], ['word:built-in', { count: 1 }], ['day:2026-10-09', { studied: 2 }]];
  await store.setMany(data);
  const deleted = libraryDeleteKeys(data.map(([key]) => key), { id: 'a' }); assert.equal(deleted.length, 7);
  storage.failing = true; assert.equal(await store.commit([['prefs', { source: 'all' }]], deleted), false);
  assert.ok(storage.getItem(PREFIX + 'word:personal:a:w0'));
  storage.failing = false; assert.equal(await store.commit([['prefs', { source: 'all' }]], deleted), true);
  for (const key of deleted) assert.equal(storage.getItem(PREFIX + key), null);
  assert.ok(storage.getItem(PREFIX + 'library:ab:0')); assert.ok(storage.getItem(PREFIX + 'word:built-in'));
  assert.equal(JSON.parse(storage.getItem(PREFIX + 'day:2026-10-09')).value.studied, 2);
});

test('personal daily bitmaps do not move built-in positions or inflate repeated study', () => {
  const day = emptyDay(), first = emptyDay(), second = emptyDay(); markStudied(day, 3, 3632);
  for (const personal of [first, first, second]) if (markStudied(personal, 0, 1)) day.studied += 1;
  assert.equal(day.studied, 3); assert.equal(markStudied(day, 3, 3632), false); assert.equal(day.studied, 3);
});

test('Google English prefers British voices and preserves available manual choices during speech', async () => {
  const voices = [{ name: 'British', voiceURI: 'gb', lang: 'en-GB' }, { name: 'Google US', voiceURI: 'google-us', lang: 'en-US' }, { name: 'Google UK', voiceURI: 'google-gb', lang: 'en-GB' }, { name: 'Chinese', voiceURI: 'zh', lang: 'zh-CN' }];
  assert.equal(chooseEnglishVoice(voices, '', true).voiceURI, 'google-gb'); assert.equal(chooseEnglishVoice(voices, 'gb', true).voiceURI, 'gb');
  assert.equal(chooseEnglishVoice([{ name: 'System US', voiceURI: '', lang: 'en-US' }, ...voices], '', true).voiceURI, 'google-gb');
  assert.equal(chooseEnglishVoice(voices.slice(0, 2), 'missing', true).voiceURI, 'google-us'); assert.equal(chooseEnglishVoice([voices[0]], '', true).voiceURI, 'gb');
  let utterance;
  const player = new SpeechPlayer({ synthesis: { getVoices: () => voices, cancel() {}, speak(value) { utterance = value; } }, createUtterance: (text) => ({ text }) });
  const playing = player.play('new word', { preferGoogle: true, rate: 1.7 });
  assert.equal(utterance.voice.voiceURI, 'google-gb'); assert.equal(utterance.rate, 1.7);
  utterance.onend(); assert.equal(await playing, true);
});
