import { onMounted, onUnmounted, reactive } from 'vue';
import { RecordStore, storageMessage } from '../storage.js';

export function usePracticeStorage(prefix) {
  const status = reactive({ state: 'loading', message: '', mode: 'IndexedDB' });
  const store = new RecordStore({ prefix, legacyKey: null, onStatus: (value) => Object.assign(status, value) });
  const save = (entries) => {
    try { return store.setMany(entries); }
    catch (error) { Object.assign(status, { state: 'error', message: error.message }); return Promise.resolve(false); }
  };
  const load = async () => {
    try { return (await store.load()).entries; }
    catch (error) { Object.assign(status, { state: 'error', message: storageMessage(error) }); return new Map(); }
  };
  const retry = async (snapshot) => {
    if (!store.db && store.mode === 'IndexedDB') await store.open();
    return store.pending.size ? store.flush() : save(snapshot);
  };
  const beforeUnload = (event) => { if (store.pending.size) { event.preventDefault(); event.returnValue = ''; } };
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onUnmounted(() => { window.removeEventListener('beforeunload', beforeUnload); store.db?.close(); });
  return { status, load, save, retry };
}
