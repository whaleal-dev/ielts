import { cp, mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';

export async function copyAudio(outputDirectory) {
  const output = pathToFileURL(resolve(outputDirectory) + '/');
  const destination = new URL('words/assets/audio/', output);
  await mkdir(destination, { recursive: true });
  await cp(new URL('../words/assets/audio/eng/', import.meta.url), new URL('eng/', destination), { recursive: true });
  console.log('已复制单词本地音频到静态构建目录。');

  const listeningFiles = JSON.parse(await readFile(new URL('../src/generated/listening-audio-files.json', import.meta.url), 'utf8'));
  for (let index = 0; index < listeningFiles.length; index += 100) {
    await Promise.all(listeningFiles.slice(index, index + 100).map(async (file) => {
      const target = new URL('listening-word/' + file.split('/').map(encodeURIComponent).join('/'), output);
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
      const target = new URL(path, output);
      await mkdir(new URL('./', target), { recursive: true });
      await cp(new URL('../' + path, import.meta.url), target);
    }));
  }
  console.log(`已复制 ${additional.length} 个新增复用的按词 MP3。`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('请指定本轮静态构建目录。');
  await copyAudio(process.argv[2]);
}
