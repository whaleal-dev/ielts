export class MemoryStorage {
  constructor() { this.data = new Map(); this.blocked = false; this.failAt = Infinity; this.operations = 0; }
  get length() { if (this.blocked) throw new Error('read unavailable'); return this.data.size; }
  key(index) { return [...this.data.keys()][index]; }
  getItem(key) { if (this.blocked) throw new Error('read unavailable'); return this.data.get(key) ?? null; }
  change() { if (++this.operations === this.failAt) throw new DOMException('Full', 'QuotaExceededError'); }
  setItem(key, value) { this.change(); this.data.set(key, value); }
  removeItem(key) { this.change(); this.data.delete(key); }
}

export class MemoryIndexedDB {
  constructor() { this.databases = new Map(); this.failRead = false; this.failWrite = false; this.tail = Promise.resolve(); }
  open(name) {
    const request = {};
    setImmediate(() => {
      const data = this.databases.get(name) || new Map();
      this.databases.set(name, data);
      request.result = { objectStoreNames: { contains: () => true }, close() {}, transaction: (_store, mode) => this.transaction(data, mode) };
      request.onsuccess?.();
    });
    return request;
  }
  transaction(data, mode) {
    let pending = 0, done = false;
    const transaction = { error: null };
    const records = new Map(data);
    let start, release;
    const gate = new Promise((resolve) => { start = resolve; });
    const finished = new Promise((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = finished;
    previous.then(() => { records.clear(); for (const entry of data) records.set(...entry); start(); });
    transaction.abort = () => {
      if (done) return;
      done = true; transaction.error ||= new DOMException('Aborted', 'AbortError');
      transaction.onabort?.(); release();
    };
    const schedule = (action) => {
      const request = {};
      pending++;
      gate.then(() => setImmediate(() => {
        if (done) return;
        try {
          if (mode === 'readonly' ? this.failRead : this.failWrite) {
            if (mode === 'readonly') this.failRead = false; else this.failWrite = false;
            throw new DOMException('Injected failure', 'UnknownError');
          }
          request.result = action(); request.onsuccess?.();
        } catch (error) { transaction.error = error; transaction.abort(); }
        pending--;
        setImmediate(() => {
          if (done || pending) return;
          done = true;
          if (mode === 'readwrite') { data.clear(); for (const entry of records) data.set(...entry); }
          transaction.oncomplete?.(); release();
        });
      }));
      return request;
    };
    transaction.objectStore = () => ({
      get: (key) => schedule(() => records.get(key)),
      put: (value, key) => schedule(() => records.set(key, structuredClone(value))),
      delete: (key) => schedule(() => records.delete(key)),
      openCursor: (range) => {
        let index = 0;
        const request = {};
        const advance = () => {
          const task = schedule(() => {
            const entry = [...records].filter(([key]) => key >= range.lower && key <= range.upper).sort(([a], [b]) => a.localeCompare(b))[index++];
            return entry ? { key: entry[0], value: entry[1], continue: advance } : null;
          });
          task.onsuccess = () => { request.result = task.result; request.onsuccess?.(); };
        };
        advance(); return request;
      },
    });
    return transaction;
  }
}
