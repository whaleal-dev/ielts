import { onMounted, onUnmounted, reactive } from 'vue';
import { RecordStore } from '../storage.js';

export function usePracticeStorage(prefix) {
  const status = reactive({ state: 'loading', message: '', mode: 'IndexedDB', loadFailed: false });
  const store = new RecordStore({ prefix, legacyKey: null, onStatus: (value) => Object.assign(status, value) });
  let restore = null;
  const save = (entries) => {
    if (!store.loaded) return Promise.resolve(false);
    try { return store.setMany(entries); }
    catch (error) { Object.assign(status, { state: 'error', message: error.message }); return Promise.resolve(false); }
  };
  const load = async (hydrate = restore) => {
    restore = hydrate;
    store.loaded = false;
    Object.assign(status, { state: 'loading', loadFailed: true, message: '' });
    try {
      const entries = (await store.load()).entries;
      restore?.(entries);
      return entries;
    }
    catch {
      store.loaded = false;
      Object.assign(status, { state: 'error', loadFailed: true, message: '无法读取浏览器存储。请允许本站使用存储后重试读取，已有数据不会被默认内容覆盖。' });
      return null;
    }
  };
  const retry = async (snapshot) => {
    if (status.loadFailed) return await load() !== null;
    if (!store.db && store.mode === 'IndexedDB') await store.open();
    return store.pending.size ? store.flush() : save(snapshot());
  };
  const beforeUnload = (event) => { if (store.pending.size) { event.preventDefault(); event.returnValue = ''; } };
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onUnmounted(() => { window.removeEventListener('beforeunload', beforeUnload); store.db?.close(); });
  return { status, load, save, retry };
}
