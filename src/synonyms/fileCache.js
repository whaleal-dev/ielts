import { DELETE_RECORD, readValue, valueRecords } from '../practice/records.js';
import { parseGroups, validateGroups } from './model.js';

export const MAX_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_CACHED_FILES = 20;
export const MAX_BATCH_SIZE = 10 * 1024 * 1024;

export function validateFileSize(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}：单个文件不能超过 2 MB。`);
}

export function validateBatchSize(files) {
  files.forEach(validateFileSize);
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_SIZE) throw new Error('每批文件合计不能超过 10 MiB，请减少所选文件。');
}

export async function readImportedFiles(incoming) {
  validateBatchSize(incoming);
  const files = [], groups = [];
  for (const file of incoming) {
    try {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('文件必须使用 UTF-8 编码，请转换编码后重新导入。'); }
      if (text.includes('\u0000')) throw new Error('文件包含空字符，请使用 UTF-8 纯文本编码重新保存。');
      const parsed = parseGroups(text, file.name);
      files.push({ name: file.name, size: file.size, text, groupCount: parsed.length });
      groups.push(parsed);
    } catch (error) { throw new Error(`${file.name}：${error.message}`); }
  }
  return { files, groups: validateGroups(groups.flat()) };
}

export function updateFileCache(previous, incoming) {
  let files = [...previous];
  for (const file of incoming) {
    const same = files.find((entry) => entry.name === file.name);
    let slot = same?.slot;
    if (same) files = files.filter((entry) => entry.name !== file.name);
    else if (files.length === MAX_CACHED_FILES) slot = files.shift().slot;
    else slot = Array.from({ length: MAX_CACHED_FILES }, (_, index) => index).find((index) => !files.some((entry) => entry.slot === index));
    files.push({ ...file, slot });
  }
  return files;
}

export function selectCachedFiles(files, names) {
  const selected = files.slice().reverse().filter((file) => names.includes(file.name));
  if (selected.length !== new Set(names).size) throw new Error('所选缓存文件已不存在，请重新选择。');
  const groups = selected.flatMap((file) => {
    try { return parseGroups(file.text, file.name); }
    catch (error) { throw new Error(`${file.name}：${error.message}`); }
  });
  validateBatchSize(selected);
  return { groups: validateGroups(groups), names: selected.map((file) => file.name) };
}

const manifest = (files) => files.map(({ slot, name, size, groupCount }) => ({ slot, name, size, groupCount }));
function replacementRecords(key, previous, next) {
  const records = valueRecords(key, next);
  if (previous !== undefined) {
    for (const [oldKey] of valueRecords(key, previous).slice(records.length)) records.push([oldKey, DELETE_RECORD]);
  }
  return records;
}

export function fileCacheRecords(previous, next) {
  const records = replacementRecords('file-cache:index', manifest(previous), manifest(next));
  for (const file of next) {
    const old = previous.find((entry) => entry.slot === file.slot);
    if (old?.text !== file.text) records.push(...replacementRecords(`file-cache:${file.slot}`, old?.text, file.text));
  }
  for (const file of previous) {
    if (!next.some((entry) => entry.slot === file.slot)) {
      for (const [key] of valueRecords(`file-cache:${file.slot}`, file.text)) records.push([key, DELETE_RECORD]);
    }
  }
  return records;
}

export function readFileCache(entries) {
  const saved = readValue(entries, 'file-cache:index', []);
  if (!Array.isArray(saved)) return [];
  const files = [];
  for (const entry of saved.slice(-MAX_CACHED_FILES)) {
    if (!entry || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= MAX_CACHED_FILES || typeof entry.name !== 'string' || !Number.isInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE_SIZE || !Number.isInteger(entry.groupCount) || entry.groupCount < 1) continue;
    if (files.some((file) => file.slot === entry.slot || file.name === entry.name)) continue;
    const text = readValue(entries, `file-cache:${entry.slot}`, null);
    if (typeof text === 'string') files.push({ ...entry, text });
  }
  return files;
}
