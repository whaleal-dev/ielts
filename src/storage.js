import { DELETE_RECORD, obsoleteChunks, readValue, valueRecords } from './practice/records.js';

export const PREFIX = 'ielts-words-v1:';
export const RECORD_LIMIT = 8 * 1024;
const DATABASE = 'apple-word-trainer';
const LEGACY_KEY = 'apple-word-trainer-v4';
const encoder = new TextEncoder();

export const byteSize = (value) => encoder.encode(JSON.stringify(value)).byteLength;
export const storageMessage = (error) => error?.name === 'QuotaExceededError'
  ? '浏览器存储空间不足，本次修改尚未保存。请保留当前页面，检查浏览器可用存储后重试。'
  : '浏览器暂时无法保存，本次修改仍在当前页面中。请允许本站使用存储后重新尝试。';

const availableStorage = (name) => {
  try { return globalThis[name]; } catch { return null; }
};

export class RecordStore {
  constructor({ indexedDB = availableStorage('indexedDB'), localStorage = availableStorage('localStorage'), onStatus = () => {}, database = DATABASE, prefix = PREFIX, legacyKey = LEGACY_KEY } = {}) {
    this.indexedDB = indexedDB;
    this.localStorage = localStorage;
    this.onStatus = onStatus;
    this.database = database;
    this.prefix = prefix;
    this.legacyKey = legacyKey;
    this.db = null;
    this.mode = 'IndexedDB';
    this.pending = new Map();
    this.saved = new Map();
    this.clock = 0;
    this.writer = null;
    this.legacyBytes = 0;
    this.loaded = false;
    this.mirrorCleanups = new Map();
  }

  async open() {
    if (this.db) return;
    try {
      if (!this.indexedDB) throw new Error('IndexedDB unavailable');
      this.db = await new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.database, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('kv')) request.result.createObjectStore('kv');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
      this.db.onversionchange = () => {
        this.db.close();
        this.db = null;
        this.onStatus({ state: 'error', message: '浏览器存储被其他页面更新，请刷新后继续学习。', mode: this.mode });
      };
    } catch {
      this.mode = 'localStorage';
    }
  }

  readLocal() {
    const entries = new Map();
    let legacy = null;
    try {
      if (this.mode === 'localStorage' && !this.localStorage) throw new Error('Storage unavailable');
      const raw = this.legacyKey ? this.localStorage?.getItem(this.legacyKey) : null;
      if (raw) {
        try { legacy = JSON.parse(raw); } catch { /* Unrelated invalid legacy data stays untouched. */ }
      }
      for (let i = 0; i < (this.localStorage?.length || 0); i += 1) {
        const key = this.localStorage.key(i);
        if (!key?.startsWith(this.prefix)) continue;
        const rawRecord = this.localStorage.getItem(key);
        try {
          const record = JSON.parse(rawRecord);
          if (record && Number.isFinite(record.at) && 'value' in record) entries.set(key, record);
        } catch { /* Keep malformed records; do not overwrite them during loading. */ }
      }
    } catch (error) {
      if (this.mode === 'localStorage') throw error;
    }
    return { entries, legacy };
  }

  async load() {
    try { return await this.read(); }
    catch (error) {
      this.onStatus({ state: 'error', loadFailed: !this.loaded, message: '无法读取浏览器存储。请允许本站使用存储后重试读取，已有数据不会被默认内容覆盖。', mode: this.mode });
      throw error;
    }
  }

  async read() {
    await this.open();
    const local = this.readLocal();
    let legacy = local.legacy;
    const entries = local.entries;
    const databaseEntries = new Map();
    if (this.db) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction('kv', 'readonly');
        const store = transaction.objectStore('kv');
        if (this.legacyKey) {
          const oldRequest = store.get(this.legacyKey);
          oldRequest.onsuccess = () => { legacy = oldRequest.result || legacy; };
        }
        const cursorRequest = store.openCursor(IDBKeyRange.bound(this.prefix, `${this.prefix}\uffff`));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const entry = cursor.value;
          if (entry && Number.isFinite(entry.at) && 'value' in entry) {
            databaseEntries.set(cursor.key, entry);
            if (!entries.has(cursor.key) || entries.get(cursor.key).at < entry.at) entries.set(cursor.key, entry);
          }
          cursor.continue();
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
    const databaseValues = new Map([...databaseEntries].map(([key, entry]) => [key.slice(this.prefix.length), entry.value]));
    for (const [key, value] of databaseValues) {
      if (!key.startsWith('__mirrorCleanup:') || !Number.isInteger(value?.parts)) continue;
      const mirroredKeys = readValue(databaseValues, key, null);
      if (!Array.isArray(mirroredKeys) || mirroredKeys.some((entry) => typeof entry !== 'string' || !entry.startsWith(this.prefix))) throw new Error('Invalid mirror cleanup record');
      const journalKeys = [this.prefix + key, ...Array.from({ length: value.parts }, (_, index) => this.prefix + key + ':' + index)];
      await this.cleanMirrors(mirroredKeys, journalKeys);
      for (const mirroredKey of mirroredKeys) {
        if (databaseEntries.has(mirroredKey)) entries.set(mirroredKey, databaseEntries.get(mirroredKey));
        else entries.delete(mirroredKey);
      }
      for (const journalKey of journalKeys) entries.delete(journalKey);
    }
    this.saved = new Map(entries);
    this.clock = [...entries.values()].reduce((clock, entry) => Math.max(clock, entry.at), 0);
    this.legacyBytes = legacy ? byteSize(legacy) : 0;
    this.loaded = true;
    this.onStatus({ state: 'saved', loadFailed: false, message: '', mode: this.mode });
    return { entries: new Map([...entries].map(([key, entry]) => [key.slice(this.prefix.length), entry.value])), legacy };
  }

  set(key, value) {
    return this.setMany([[key, value]]);
  }

  setMany(values) {
    const at = Math.max(Date.now(), this.clock + 1);
    const entries = this.prepareEntries(values, at);
    this.clock = at;
    for (const [key, entry] of entries) this.pending.set(key, entry);
    this.onStatus({ state: 'saving', message: '', mode: this.mode });
    return this.flush();
  }

  prepareEntries(values, at, deletedKeys = []) {
    const changes = new Map(values);
    const storedKeys = [...new Set([...this.saved.keys(), ...this.pending.keys()])].map((key) => key.slice(this.prefix.length));
    for (const [key, value] of values) {
      const chunkKey = key === 'customParts' ? 'custom' : key;
      const parts = key === 'customParts' ? value : value?.parts;
      if (Number.isInteger(parts) && parts >= 0) for (const oldKey of obsoleteChunks(storedKeys, chunkKey, parts)) if (!changes.has(oldKey)) changes.set(oldKey, DELETE_RECORD);
    }
    for (const key of deletedKeys) changes.set(key, DELETE_RECORD);
    return [...changes].map(([key, value]) => {
      const fullKey = this.prefix + key;
      if (value === DELETE_RECORD) return [fullKey, null];
      const entry = { at, value: JSON.parse(JSON.stringify(value)) };
      if (byteSize({ key: fullKey, ...entry }) > RECORD_LIMIT) {
        const error = new RangeError('单条学习记录超过 8 KiB，本次修改尚未保存。');
        this.onStatus({ state: 'error', message: error.message, mode: this.mode });
        throw error;
      }
      return [fullKey, entry];
    });
  }

  async writeIndexed(entries) {
    if (!this.db) throw new Error('IndexedDB closed');
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction('kv', 'readwrite');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      try {
        for (const [key, value] of entries) {
          if (value === null) transaction.objectStore('kv').delete(key);
          else transaction.objectStore('kv').put(value, key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async cleanMirrors(keys, journalKeys) {
    for (const key of keys) this.localStorage.removeItem(key);
    if (journalKeys.length) await this.writeIndexed(journalKeys.map((key) => [key, null]));
    this.mirrorCleanups.delete(journalKeys[0]);
  }

  async write(entries) {
    if (this.mode === 'IndexedDB') {
      for (const cleanup of this.mirrorCleanups.values()) await this.cleanMirrors(cleanup.keys, cleanup.journalKeys);
      const mirrored = this.localStorage ? entries.filter(([key]) => this.localStorage.getItem(key) !== null).map(([key]) => key) : [];
      if (!mirrored.length) { await this.writeIndexed(entries); return; }
      const journal = '__mirrorCleanup:' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const journalEntries = this.prepareEntries(valueRecords(journal, mirrored), Math.max(this.clock, Date.now()));
      await this.writeIndexed([...entries, ...journalEntries]);
      const journalKeys = journalEntries.map(([key]) => key);
      this.mirrorCleanups.set(journalKeys[0], { keys: mirrored, journalKeys });
      await this.cleanMirrors(mirrored, journalKeys);
      return;
    }
    this.localStorage ||= availableStorage('localStorage');
    if (!this.localStorage) throw new Error('Local storage unavailable');
    const previous = entries.map(([key]) => [key, this.localStorage.getItem(key)]);
    try {
      for (const [key, value] of entries) {
        if (value === null) this.localStorage.removeItem(key);
        else this.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      for (const [key, value] of previous.reverse()) {
        try {
          if (value === null) this.localStorage.removeItem(key);
          else this.localStorage.setItem(key, value);
        } catch { /* Pending data remains available for retry even if rollback is blocked. */ }
      }
      throw error;
    }
  }

  flush() {
    if (this.writer) return this.writer;
    this.writer = this.drain().finally(() => { this.writer = null; });
    return this.writer;
  }

  async commit(values, deletedKeys = []) {
    if (!await this.flush()) return false;
    const at = Math.max(Date.now(), this.clock + 1);
    const writes = this.prepareEntries(values, at, deletedKeys);
    this.onStatus({ state: 'saving', message: '', mode: this.mode });
    try {
      await this.write(writes);
      this.clock = at;
      for (const [key, entry] of writes) { if (entry === null) this.saved.delete(key); else this.saved.set(key, entry); }
      this.onStatus({ state: this.pending.size ? 'saving' : 'saved', message: '', mode: this.mode });
      return true;
    } catch (error) {
      this.onStatus({ state: 'error', message: storageMessage(error), mode: this.mode });
      return false;
    }
  }

  async drain() {
    try {
      while (this.pending.size) {
        const entries = [...this.pending.entries()];
        await this.write(entries);
        for (const [key, value] of entries) {
          if (value === null) this.saved.delete(key); else this.saved.set(key, value);
          if (this.pending.get(key) === value) this.pending.delete(key);
        }
      }
      this.onStatus({ state: 'saved', message: '', mode: this.mode });
      return true;
    } catch (error) {
      this.onStatus({ state: 'error', message: storageMessage(error), mode: this.mode });
      return false;
    }
  }

  sizes() {
    const bytes = [...this.saved].map(([key, entry]) => byteSize({ key, ...entry }));
    return { total: bytes.reduce((sum, size) => sum + size, this.legacyBytes), largest: bytes.reduce((largest, size) => Math.max(largest, size), 0), count: this.saved.size };
  }
}

export function wordRecords(key, record) {
  const { note = '', ...value } = record;
  const parts = [];
  for (let i = 0; i < note.length; i += 512) parts.push(note.slice(i, i + 512));
  return [
    [`word:${key}`, { ...value, noteParts: parts.length }],
    ...parts.map((part, index) => [`note:${key}:${index}`, part]),
  ];
}
