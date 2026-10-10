import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { normalizeTerm } from '../src/wordImport.js';
import { displayWord, audioFilename } from '../src/listening/model.js';

const source = new URL('../words/data/generated/word_groups/', import.meta.url);
const output = new URL('../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
const chapters = new Map();
const audioRoot = new URL('../words/assets/audio/', import.meta.url);
const themeFiles = new Set(await readdir(new URL('eng/', audioRoot)));
const audioIndex = new Map();
const audioFiles = new Set();
const addAudio = (term, path) => {
  const key = normalizeTerm(term);
  if (!key || audioIndex.has(key)) return;
  audioIndex.set(key, encodeURI('/' + path).replace(/[?#]/g, encodeURIComponent));
  audioFiles.add(path);
};
for (const filename of (await readdir(source)).filter((name) => name.endsWith('.json')).sort()) {
  const data = JSON.parse(await readFile(new URL(filename, source), 'utf8'));
  const number = Number(data.chapter.match(/Chapter\s+(\d+)/)?.[1]);
  if (!chapters.has(number)) chapters.set(number, {});
  chapters.get(number)[filename] = {
    chapter: data.chapter,
    group: data.group,
    words: data.words.map(({ id, word, eng_phonetic, meaning }) => ({ id, word, eng_phonetic, meaning })),
  };
  for (const word of data.words) {
    if (word.id && themeFiles.has(`${word.id}.mp3`)) addAudio(word.word, `words/assets/audio/eng/${word.id}.mp3`);
  }
}
for (const [number, chapter] of chapters) {
  await writeFile(new URL(`chapter-${String(number).padStart(2, '0')}.json`, output), JSON.stringify(chapter));
}
for (const filename of (await readdir(new URL('eng_by_word/', audioRoot))).filter((name) => name.endsWith('.mp3')).sort()) {
  addAudio(filename.slice(0, -4).replace(/_/g, ' '), `words/assets/audio/eng_by_word/${filename}`);
}
const listeningRoot = new URL('../listening-word/', import.meta.url);
const listeningFiles = new Set(JSON.parse(await readFile(new URL('listening-audio-files.json', output), 'utf8')));
for (const filename of (await readdir(output)).filter((name) => /^listening-chapter-\d+\.json$/.test(name)).sort()) {
  const data = JSON.parse(await readFile(new URL(filename, output), 'utf8'));
  for (const group of Object.values(data)) {
    for (const raw of group.words) {
      if (group.missing.includes(raw)) continue;
      const path = group.overrides[raw] || `${group.directory}/${audioFilename(displayWord(raw), group.encoding)}`;
      if (listeningFiles.has(path)) {
        await access(new URL(path.split('/').map(encodeURIComponent).join('/'), listeningRoot));
        addAudio(displayWord(raw), `listening-word/${path}`);
      }
    }
  }
}
await writeFile(new URL('word-audio-index.json', output), JSON.stringify(Object.fromEntries(audioIndex)));
await writeFile(new URL('word-audio-files.json', output), JSON.stringify([...audioFiles]));
console.log(`已准备 ${chapters.size} 个章节的精简词库。`);
console.log(`已核验 ${audioIndex.size} 个完整词条的本地 MP3 映射。`);
