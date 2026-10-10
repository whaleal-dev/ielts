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
    try {
      const entries = (await store.load()).entries;
      restore?.(entries);
      return entries;
    }
    catch { return null; }
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
