const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

export function dayKey(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return calendar.format(date);
}

export function recentDays(count, value = Date.now()) {
  const today = Date.parse(dayKey(value) + 'T00:00:00Z');
  return Array.from({ length: count }, (_, index) => new Date(today - (count - 1 - index) * 86400000).toISOString().slice(0, 10));
}

export function studyStreak(days, value = Date.now()) {
  let date = Date.parse(dayKey(value) + 'T00:00:00Z'), result = 0;
  const key = () => new Date(date).toISOString().slice(0, 10);
  if (!days[key()]?.studied) date -= 86400000;
  while (days[key()]?.studied) { result++; date -= 86400000; }
  return result;
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
