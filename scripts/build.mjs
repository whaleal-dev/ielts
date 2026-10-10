import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { copyAudio } from './copy-audio.mjs';

let destination;
await build({ plugins: [{ name: 'current-build-directory', configResolved(config) { destination = config.build.outDir; } }] });
await copyAudio(destination);
await writeFile(new URL('../dist/latest.json', import.meta.url), JSON.stringify({ directory: relative(fileURLToPath(new URL('../', import.meta.url)), destination), builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`本轮完整静态产物：${destination}`);
