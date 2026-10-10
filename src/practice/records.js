export const DELETE_RECORD = Symbol('delete record');

export function obsoleteChunks(keys, key, count) {
  const prefix = key + ':';
  return [...keys].filter((entry) => entry.startsWith(prefix) && /^\d+$/.test(entry.slice(prefix.length)) && Number(entry.slice(prefix.length)) >= count);
}

export function valueRecords(key, value) {
  const text = JSON.stringify(value);
  const parts = [];
  for (let index = 0; index < text.length; index += 1024) parts.push(text.slice(index, index + 1024));
  return [[key, { parts: parts.length }], ...parts.map((part, index) => [`${key}:${index}`, part])];
}

export function readValue(entries, key, fallback) {
  const count = entries.get(key)?.parts;
  if (!Number.isInteger(count) || count < 1) return fallback;
  const parts = Array.from({ length: count }, (_, index) => entries.get(`${key}:${index}`));
  if (parts.some((part) => typeof part !== 'string')) return fallback;
  try { return JSON.parse(parts.join('')); } catch { return fallback; }
}

export const readLocalValue = (key) => {
  const raw = globalThis.localStorage?.getItem(key);
  try { return JSON.parse(raw || 'null'); } catch { return null; }
};
