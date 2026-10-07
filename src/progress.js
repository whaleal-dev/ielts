export function dayKey(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const emptyDay = () => ({ studied: 0, events: 0, mastered: 0, reviewed: 0, seen: '' });

export function markStudied(day, index, wordCount) {
  const bytes = new Uint8Array(Math.ceil(wordCount / 8));
  if (day.seen) {
    try { bytes.set(Uint8Array.from(atob(day.seen), (character) => character.charCodeAt(0)).subarray(0, bytes.length)); } catch { /* A damaged bitmap can be rebuilt from subsequent study events. */ }
  }
  const byte = Math.floor(index / 8);
  const bit = 1 << (index % 8);
  if (bytes[byte] & bit) return false;
  bytes[byte] |= bit;
  day.studied += 1;
  day.seen = btoa(String.fromCharCode(...bytes));
  return true;
}
