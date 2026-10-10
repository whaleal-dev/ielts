import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function createBuildDirectory() {
  const releases = resolve(projectRoot, 'dist/releases');
  mkdirSync(releases, { recursive: true });
  return mkdtempSync(resolve(releases, 'build-'));
}

export function latestBuildDirectory() {
  try { return resolve(projectRoot, JSON.parse(readFileSync(resolve(projectRoot, 'dist/latest.json'), 'utf8')).directory); }
  catch (error) { if (error.code === 'ENOENT') return resolve(projectRoot, 'dist'); throw error; }
}
