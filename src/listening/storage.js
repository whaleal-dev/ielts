import { byteSize, RecordStore } from '../storage.js';
import { LISTENING_PREFIX } from './model.js';

export const legacyKeys = { settings: 'ielts-dictation-settings-v2', mistakes: 'ielts-dictation-mistake-book-v1', wordStats: 'ielts-dictation-word-stats-v1', chapterStats: 'ielts-dictation-chapter-stats-v1' };
export const createListeningStore = (options = {}) => new RecordStore({ ...options, database: 'ielts-dictation-data-db', prefix: LISTENING_PREFIX, legacyKey: null });

export async function readLegacy(store) {
  const result = {};
  for (const [name, key] of Object.entries(legacyKeys)) {
    const raw = store.localStorage?.getItem(key);
    try { result[name] = JSON.parse(raw || 'null'); }
    catch { result[name] = null; }
  }
  if (store.db) await new Promise((resolve, reject) => {
    const transaction = store.db.transaction('kv', 'readonly');
    for (const [name, key] of Object.entries(legacyKeys)) {
      if (name === 'settings') continue;
      const request = transaction.objectStore('kv').get(key);
      request.onsuccess = () => { if (request.result != null) result[name] = request.result; };
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  store.legacyBytes = Object.values(result).filter((value) => value != null).reduce((total, value) => total + byteSize(value), 0);
  return result;
}
