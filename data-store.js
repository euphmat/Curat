const DEFAULT_DB_NAME = "curat-app-data-v1";
const STORE_NAME = "snapshots";
const DATA_KEY = "main";

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export class DataStore {
  constructor({ dbName = DEFAULT_DB_NAME, indexedDB = globalThis.indexedDB } = {}) {
    this.dbName = dbName;
    this.indexedDB = indexedDB;
    this.dbPromise = null;
  }

  open() {
    if (!this.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable"));
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open was blocked"));
    }).catch((error) => {
      this.dbPromise = null;
      throw error;
    });

    return this.dbPromise;
  }

  async load() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(DATA_KEY);
      request.onsuccess = () => resolve(request.result ? cloneData(request.result) : null);
      request.onerror = () => reject(request.error);
    });
  }

  async save(value) {
    const snapshot = cloneData(value);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, DATA_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const dataStore = new DataStore();
