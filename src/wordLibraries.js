import { readValue, valueRecords } from './practice/records.js';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export function libraryName(name, names) {
  const base = name.trim();
  if (!base) throw new Error('词库名称不能为空。');
  let result = base, suffix = 2;
  while (names.includes(result)) result = `${base}（${suffix++}）`;
  return result;
}

export function createWordLibrary(parsed, name, names, { id = newId(), createdAt = new Date().toISOString(), filename = '' } = {}) {
  const library = { id, title: libraryName(name, names), createdAt, filename, personal: true };
  library.groups = parsed.groups.map((group, index) => ({ title: group.title, words: group.words.map(({ word, meaning, phonetic }) => ({ word, meaning, phonetic })), id: `personal:${id}:g${index}` }));
  return library;
}

export function expandWordLibrary(library, audioForTerm) {
  let index = 0;
  const groups = library.groups.map((group, groupIndex) => ({
    ...group, id: `personal:${library.id}:g${groupIndex}`,
    words: group.words.map((word, wordIndex) => ({ ...word, key: `personal:${library.id}:w${index++}`, sourceId: library.id,
      groupId: `personal:${library.id}:g${groupIndex}`, groupTitle: group.title, chapterTitle: library.title, wordIndex, audio: audioForTerm(word.word) })),
  }));
  return { ...library, groups, words: groups.flatMap((group) => group.words) };
}

export const directoryRecords = (libraries) => valueRecords('libraries', libraries.map(({ id, title, createdAt, filename }) => ({ id, title, createdAt, filename })));
export const wordLibraryRecords = (library) => valueRecords(`library:${library.id}`, library.groups.map(({ title, words }) => ({ title, words: words.map(({ word, meaning, phonetic }) => ({ word, meaning, phonetic })) })));

export function readWordLibraries(entries, audioForTerm) {
  return readValue(entries, 'libraries', []).flatMap((metadata) => {
    const groups = readValue(entries, `library:${metadata.id}`, null);
    if (!groups?.length) return [];
    return [expandWordLibrary({ ...metadata, personal: true, groups }, audioForTerm)];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function libraryDeleteKeys(keys, library) {
  const prefixes = [`library:${library.id}`, `word:personal:${library.id}:`, `note:personal:${library.id}:`, `position:personal:${library.id}:`, `libraryDay:${library.id}:`];
  return [...keys].filter((key) => key === `libraryPosition:${library.id}` || prefixes.some((prefix) => key.startsWith(prefix.endsWith(':') ? prefix : prefix + ':')) || key === prefixes[0]);
}
