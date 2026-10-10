import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

test('audio generation chooses complete matches by priority and copies word-only resources with encoded paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ielts-word-audio-'));
  const save = async (path, content) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
  for (const path of ['scripts/prepare-words.mjs', 'scripts/copy-audio.mjs', 'src/wordImport.js', 'src/listening/model.js']) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(new URL('../' + path, import.meta.url), join(root, path));
  }
  await save('package.json', '{"type":"module"}');
  await save('words/data/generated/word_groups/Chapter_1.json', JSON.stringify({ chapter: 'Chapter 1 主题', group: '第一组', words: [{ id: 'local+100%', word: 'Same Word' }, { id: 'missing', word: 'not available' }] }));
  await save('words/assets/audio/eng/local+100%.mp3', 'fixture');
  await save('words/assets/audio/eng_by_word/same_word.mp3', 'fixture');
  await save('words/assets/audio/eng_by_word/only_word.mp3', 'fixture');
  await save('words/assets/audio/eng_by_word/space_plus+100%.mp3', 'fixture');
  const listening = 'folder 空格/audio+100%.mp3';
  await save('listening-word/' + listening, 'fixture');
  await save('src/generated/listening-audio-files.json', JSON.stringify([listening]));
  await save('src/generated/listening-chapter-1.json', JSON.stringify({ 1: { words: ['exact phrase', 'same word'], missing: [], overrides: { 'exact phrase': listening, 'same word': listening } } }));
  execFileSync(process.execPath, [join(root, 'scripts/prepare-words.mjs')], { stdio: 'pipe' });
  const index = JSON.parse(await readFile(join(root, 'src/generated/word-audio-index.json'), 'utf8'));
  assert.equal(index['same word'], '/words/assets/audio/eng/local+100%25.mp3');
  assert.equal(index['only word'], '/words/assets/audio/eng_by_word/only_word.mp3');
  assert.equal(index['space plus+100%'], '/words/assets/audio/eng_by_word/space_plus+100%25.mp3');
  assert.equal(index['exact phrase'], '/listening-word/folder%20%E7%A9%BA%E6%A0%BC/audio+100%25.mp3');
  for (const term of ['only', 'only words', 'exact', 'not available']) assert.equal(index[term], undefined);
  await save('dist/obsolete.js', 'old build');
  const output = join(root, 'dist/releases/current-build');
  execFileSync(process.execPath, [join(root, 'scripts/copy-audio.mjs'), output], { stdio: 'pipe' });
  for (const url of Object.values(index)) await access(join(output, decodeURIComponent(url)));
  assert.equal(await readFile(join(output, 'words/assets/audio/eng_by_word/only_word.mp3'), 'utf8'), 'fixture');
  await assert.rejects(access(join(output, 'obsolete.js')), { code: 'ENOENT' });
  await access(join(root, 'dist/obsolete.js'));
});
