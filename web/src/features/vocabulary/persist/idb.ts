/**
 * IndexedDB kv 封装 —— 对应 legacy openIdb/idbGet/idbSet(2673–2719)。
 */
import { IDB_NAME, IDB_STORE } from '../constants'

let dbPromise: Promise<IDBDatabase> | null = null

function openIdb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('indexeddb_unavailable'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(IDB_NAME, 1)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'))
    request.onblocked = () => reject(new Error('indexeddb_blocked'))
  })
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const request = tx.objectStore(IDB_STORE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error || new Error('indexeddb_get_failed'))
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('indexeddb_put_failed'))
    tx.onabort = () => reject(tx.error || new Error('indexeddb_put_aborted'))
  })
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openIdb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('indexeddb_delete_failed'))
    tx.onabort = () => reject(tx.error || new Error('indexeddb_delete_aborted'))
  })
}
