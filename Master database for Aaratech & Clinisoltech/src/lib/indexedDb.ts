// Permanent Browser Database using Native IndexedDB
// Provides high-capacity permanent storage (hundreds of MBs/GBs)
// Solves browser LocalStorage 5MB quota errors and prevents data loss on refresh

import { Person, Job, ImportRecord, PossibleMatch, AuditLog, MergeHistory } from '../types/database';

const DB_NAME = 'aaratech_clinisoltech_master_db';
const DB_VERSION = 2;

export type DBStoreName =
  | 'people'
  | 'jobs'
  | 'imports'
  | 'possibleMatches'
  | 'auditLogs'
  | 'mergeHistories'
  | 'incompleteRecords'
  | 'settings';

class IndexedDBManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private isSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  public getDB(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) {
      return Promise.resolve(null);
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          if (!db.objectStoreNames.contains('people')) {
            const peopleStore = db.createObjectStore('people', { keyPath: 'id' });
            peopleStore.createIndex('person_id', 'person_id', { unique: false });
            peopleStore.createIndex('primary_email', 'primary_email', { unique: false });
            peopleStore.createIndex('primary_phone', 'primary_phone', { unique: false });
            peopleStore.createIndex('last_activity_at', 'last_activity_at', { unique: false });
          }

          if (!db.objectStoreNames.contains('jobs')) {
            db.createObjectStore('jobs', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('imports')) {
            db.createObjectStore('imports', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('possibleMatches')) {
            db.createObjectStore('possibleMatches', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('auditLogs')) {
            db.createObjectStore('auditLogs', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('mergeHistories')) {
            db.createObjectStore('mergeHistories', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('incompleteRecords')) {
            const incStore = db.createObjectStore('incompleteRecords', { keyPath: 'id' });
            incStore.createIndex('company', 'company', { unique: false });
            incStore.createIndex('missing_reason', 'missing_reason', { unique: false });
            incStore.createIndex('created_at', 'created_at', { unique: false });
          }

          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (err) => {
          console.error('IndexedDB open error:', err);
          resolve(null);
        };
      } catch (e) {
        console.error('IndexedDB init failed:', e);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async getAll<T>(storeName: DBStoreName): Promise<T[]> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve((req.result as T[]) || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        console.error(`IndexedDB getAll error on ${storeName}:`, e);
        resolve([]);
      }
    });
  }

  public async getItem<T>(storeName: DBStoreName, key: string): Promise<T | null> {
    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => resolve((req.result as T) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async putItem<T>(storeName: DBStoreName, item: T): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        console.error(`IndexedDB putItem error on ${storeName}:`, e);
        resolve(false);
      }
    });
  }

  public async putBatch<T>(storeName: DBStoreName, items: T[]): Promise<boolean> {
    if (!items || items.length === 0) return true;
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        for (const item of items) {
          store.put(item);
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.error(`IndexedDB putBatch error on ${storeName}:`, e);
          resolve(false);
        };
      } catch (e) {
        console.error(`IndexedDB putBatch exception on ${storeName}:`, e);
        resolve(false);
      }
    });
  }

  public async deleteItem(storeName: DBStoreName, key: string): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async clearStore(storeName: DBStoreName): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async clearAll(): Promise<boolean> {
    const stores: DBStoreName[] = ['people', 'jobs', 'imports', 'possibleMatches', 'auditLogs', 'mergeHistories', 'incompleteRecords'];
    for (const s of stores) {
      await this.clearStore(s);
    }
    return true;
  }

  public async getStorageStats(): Promise<{
    peopleCount: number;
    jobsCount: number;
    importsCount: number;
    matchesCount: number;
  }> {
    const people = await this.getAll<Person>('people');
    const jobs = await this.getAll<Job>('jobs');
    const imports = await this.getAll<ImportRecord>('imports');
    const possibleMatches = await this.getAll<PossibleMatch>('possibleMatches');

    return {
      peopleCount: people.length,
      jobsCount: jobs.length,
      importsCount: imports.length,
      matchesCount: possibleMatches.length,
    };
  }
}

export const indexedDBService = new IndexedDBManager();
