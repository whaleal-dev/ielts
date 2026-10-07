import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { normalize, displayWord, audioFilename } from '../src/listening/model.js';

const root = new URL('../listening-word/', import.meta.url);
const output = new URL('../src/generated/', import.meta.url);
const source = JSON.parse(await readFile(new URL('data/corpus.json', root), 'utf8'));
const files = new Set((await readdir(root, { recursive: true })).filter((name) => name.endsWith('.mp3')));
const sectionMap = { 1201: '1', 1202: '2', 1203: '3', 1204: '4', 1205: '5', 12041: '41', 12042: '42', 12043: '43' };
const chapters = new Map();
const audioFiles = new Set();
const missing = [];
let total = 0;
for (const [id, sourceGroup] of Object.entries(source)) {
  const chapter = Number(sourceGroup.title.match(/^Chapter\s+(\d+)/)?.[1]);
  const match = sourceGroup.title.match(/^Chapter 8 (.+?) (\d{2}_.+_chunks)$/);
  const group = { id, title: sourceGroup.title, words: [...new Set(sourceGroup.words.map(normalize))], directory: match ? `chapter8/${match[1]}/${match[2]}` : sectionMap[id] ? `chunks/section${sectionMap[id]}` : `assets/audio/${id}`, encoding: match || sectionMap[id] ? 'underscore' : 'plus', overrides: {}, missing: [] };
  for (const raw of group.words) {
    const word = displayWord(raw);
    const primary = `${group.directory}/${audioFilename(word, group.encoding)}`;
    const candidates = [primary];
    if (id === '833' && word === 'yen?') candidates.unshift('chapter8/3 money/03_Training_3-Test_1特殊语料2_chunks/yen_question.mp3');
    const original = sourceGroup.words.find((entry) => normalize(entry) === raw)?.trim().toLowerCase();
    if (original && original !== word) candidates.push(`${group.directory}/${audioFilename(original, group.encoding)}`);
    // The split Section 4 shares its source with the complete Section 4.
    if (['12041', '12042', '12043'].includes(id) || (id === '1104' && raw !== word)) candidates.push(`chunks/section4/${audioFilename(word, 'underscore')}`);
    const file = candidates.find((path) => files.has(path));
    total += 1;
    if (!file) { group.missing.push(raw); missing.push({ groupId: id, word }); }
    else { audioFiles.add(file); if (file !== primary) group.overrides[raw] = file; }
  }
  if (!chapters.has(chapter)) chapters.set(chapter, {});
  chapters.get(chapter)[id] = group;
}
await mkdir(output, { recursive: true });
for (const [chapter, groups] of chapters) await writeFile(new URL(`listening-chapter-${chapter}.json`, output), JSON.stringify(groups));
await writeFile(new URL('listening-audio-files.json', output), JSON.stringify([...audioFiles]));
await writeFile(new URL('listening-audio-report.json', output), JSON.stringify({ total, available: total - missing.length, files: audioFiles.size, missing }, null, 2) + '\n');
console.log(`已准备听力语料 ${chapters.size} 章、${Object.keys(source).length} 组、${total} 条，本地音频覆盖 ${total - missing.length} 条。`);
for (const item of missing) console.log(`缺失音频：${item.groupId} / ${item.word}`);
