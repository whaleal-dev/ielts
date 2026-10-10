import { cp, mkdir, readFile } from 'node:fs/promises';

const destination = new URL('../dist/words/assets/audio/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../words/assets/audio/eng/', import.meta.url), new URL('eng/', destination), { recursive: true });
console.log('已复制单词本地音频到静态构建目录。');

const listeningFiles = JSON.parse(await readFile(new URL('../src/generated/listening-audio-files.json', import.meta.url), 'utf8'));
for (let index = 0; index < listeningFiles.length; index += 100) {
  await Promise.all(listeningFiles.slice(index, index + 100).map(async (file) => {
    const target = new URL('../dist/listening-word/' + file.split('/').map(encodeURIComponent).join('/'), import.meta.url);
    await mkdir(new URL('./', target), { recursive: true });
    await cp(new URL('../listening-word/' + file.split('/').map(encodeURIComponent).join('/'), import.meta.url), target);
  }));
}
console.log(`已复制 ${listeningFiles.length} 个听力本地音频到静态构建目录。`);

const wordFiles = JSON.parse(await readFile(new URL('../src/generated/word-audio-files.json', import.meta.url), 'utf8'));
const additional = wordFiles.filter((file) => file.startsWith('words/assets/audio/eng_by_word/'));
for (let index = 0; index < additional.length; index += 100) {
  await Promise.all(additional.slice(index, index + 100).map(async (file) => {
    const path = file.split('/').map(encodeURIComponent).join('/');
    const target = new URL('../dist/' + path, import.meta.url);
    await mkdir(new URL('./', target), { recursive: true });
    await cp(new URL('../' + path, import.meta.url), target);
  }));
}
console.log(`已复制 ${additional.length} 个新增复用的按词 MP3。`);
