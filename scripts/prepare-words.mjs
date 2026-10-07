import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../words/data/generated/word_groups/', import.meta.url);
const output = new URL('../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
const chapters = new Map();
for (const filename of (await readdir(source)).filter((name) => name.endsWith('.json'))) {
  const data = JSON.parse(await readFile(new URL(filename, source), 'utf8'));
  const number = Number(data.chapter.match(/Chapter\s+(\d+)/)?.[1]);
  if (!chapters.has(number)) chapters.set(number, {});
  chapters.get(number)[filename] = {
    chapter: data.chapter,
    group: data.group,
    words: data.words.map(({ id, word, eng_phonetic, meaning }) => ({ id, word, eng_phonetic, meaning })),
  };
}
for (const [number, chapter] of chapters) {
  await writeFile(new URL(`chapter-${String(number).padStart(2, '0')}.json`, output), JSON.stringify(chapter));
}
console.log(`已准备 ${chapters.size} 个章节的精简词库。`);
