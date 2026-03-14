
/**
 * IndexedDB-based offline storage for ArtMood Factory OS
 * Stores queued actions and cached data for offline use
 */

const DB_NAME = 'artmood_offline';
const DB_VERSION = 1;
const STORES = {
  ACTIONS: 'offline_actions',
  CACHE: 'data_cache',
};

interface OfflineAction {
  id: string;
  type: 'insert' | 'update' | 'delete' | 'rpc';
  table: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.ACTIONS)) {
        const store = db.createObjectStore(STORES.ACTIONS, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        db.createObjectStore(STORES.CACHE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queue an action for later sync
 */
export async function queueAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'synced'>): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const entry: OfflineAction = {
    ...action,
    id,
    timestamp: Date.now(),
    synced: false,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ACTIONS, 'readwrite');
    tx.objectStore(STORES.ACTIONS).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all pending (unsynced) actions
 */
export async function getPendingActions(): Promise<OfflineAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ACTIONS, 'readonly');
    const index = tx.objectStore(STORES.ACTIONS).index('synced');
    const request = (index as any).getAll(false);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mark an action as synced
 */
export async function markSynced(actionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.ACTIONS);
    const request = store.get(actionId);
    request.onsuccess = () => {
      const action = request.result;
      if (action) {
        action.synced = true;
        store.put(action);
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear synced actions older than given age (ms)
 */
export async function clearOldActions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await openDB();
  const cutoff = Date.now() - maxAgeMs;
  let count = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.ACTIONS);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const action = cursor.value as OfflineAction;
        if (action.synced && action.timestamp < cutoff) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Cache data for offline access
 */
export async function cacheData(key: string, data: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHE, 'readwrite');
    tx.objectStore(STORES.CACHE).put({ key, data, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get cached data
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHE, 'readonly');
    const request = tx.objectStore(STORES.CACHE).get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.data : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get count of pending actions
 */
export async function getPendingCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}
