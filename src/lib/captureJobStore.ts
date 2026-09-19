/**
 * Persistent Storage for AXON Interface Capture Jobs.
 * Persists job state, completed interfaces, segmented outputs, and content hashes.
 * Ensures the system can resume from the exact last successful state if interrupted.
 */

import { CaptureJob, CaptureJobItem } from './captureTypes';

const DB_NAME = 'axon_capture_system_db';
const DB_VERSION = 1;
const STORE_JOBS = 'capture_jobs';
const STORE_ITEMS = 'capture_items';
const STORE_HASHES = 'content_hashes';

class CaptureJobStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryJobs = new Map<string, CaptureJob>();
  private memoryItems = new Map<string, CaptureJobItem>();
  private memoryHashes = new Map<string, { hash: string; itemId: string; timestamp: number }>();
  private activeJobId: string | null = null;

  constructor() {
    this.initDatabase();
    this.loadActiveJobIdFromLocalStorage();
  }

  private loadActiveJobIdFromLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        this.activeJobId = localStorage.getItem('axon_active_capture_job_id');
      } catch {
        // Storage might be restricted
      }
    }
  }

  private saveActiveJobIdToLocalStorage(jobId: string | null) {
    this.activeJobId = jobId;
    if (typeof localStorage !== 'undefined') {
      try {
        if (jobId) {
          localStorage.setItem('axon_active_capture_job_id', jobId);
        } else {
          localStorage.removeItem('axon_active_capture_job_id');
        }
      } catch {
        // Ignore
      }
    }
  }

  private initDatabase(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result as IDBDatabase;
          if (!db.objectStoreNames.contains(STORE_JOBS)) {
            db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ITEMS)) {
            db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_HASHES)) {
            db.createObjectStore(STORE_HASHES, { keyPath: 'interfaceId' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB unavailable, falling back to memory/localStorage.');
          resolve(null);
        };
      } catch (err) {
        console.warn('Failed to open IndexedDB:', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  async saveJob(job: CaptureJob): Promise<void> {
    this.memoryJobs.set(job.id, job);
    this.saveActiveJobIdToLocalStorage(job.id);

    const db = await this.initDatabase();
    if (!db) {
      this.saveJobToLocalStorageFallback(job);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_JOBS], 'readwrite');
        const store = tx.objectStore(STORE_JOBS);
        // Save job metadata without deep dataUrls to save DB space
        const jobToSave = { ...job };
        store.put(jobToSave);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this.saveJobToLocalStorageFallback(job);
          resolve();
        };
      } catch {
        this.saveJobToLocalStorageFallback(job);
        resolve();
      }
    });
  }

  async loadJob(jobId: string): Promise<CaptureJob | null> {
    if (this.memoryJobs.has(jobId)) {
      return this.memoryJobs.get(jobId)!;
    }

    const db = await this.initDatabase();
    if (!db) {
      return this.loadJobFromLocalStorageFallback(jobId);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_JOBS], 'readonly');
        const store = tx.objectStore(STORE_JOBS);
        const req = store.get(jobId);
        req.onsuccess = () => {
          const res = req.result as CaptureJob | undefined;
          if (res) {
            this.memoryJobs.set(jobId, res);
            resolve(res);
          } else {
            resolve(this.loadJobFromLocalStorageFallback(jobId));
          }
        };
        req.onerror = () => resolve(this.loadJobFromLocalStorageFallback(jobId));
      } catch {
        resolve(this.loadJobFromLocalStorageFallback(jobId));
      }
    });
  }

  async getActiveJob(): Promise<CaptureJob | null> {
    if (!this.activeJobId) return null;
    return await this.loadJob(this.activeJobId);
  }

  async saveJobItem(jobId: string, item: CaptureJobItem): Promise<void> {
    const key = `${jobId}::${item.id}`;
    this.memoryItems.set(key, item);

    // Update parent in memory job
    const job = this.memoryJobs.get(jobId);
    if (job) {
      job.items[item.id] = item;
      job.updatedAt = Date.now();
    }

    const db = await this.initDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_ITEMS], 'readwrite');
        const store = tx.objectStore(STORE_ITEMS);
        store.put({ ...item, id: key });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async loadJobItems(jobId: string): Promise<CaptureJobItem[]> {
    const items: CaptureJobItem[] = [];
    for (const [key, item] of this.memoryItems.entries()) {
      if (key.startsWith(`${jobId}::`)) {
        items.push(item);
      }
    }
    if (items.length > 0) return items;

    const db = await this.initDatabase();
    if (!db) return items;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_ITEMS], 'readonly');
        const store = tx.objectStore(STORE_ITEMS);
        const req = store.openCursor();
        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            if (typeof cursor.key === 'string' && cursor.key.startsWith(`${jobId}::`)) {
              items.push(cursor.value);
              this.memoryItems.set(cursor.key, cursor.value);
            }
            cursor.continue();
          } else {
            resolve(items);
          }
        };
        req.onerror = () => resolve(items);
      } catch {
        resolve(items);
      }
    });
  }

  async saveContentHash(interfaceId: string, hash: string, itemId: string): Promise<void> {
    this.memoryHashes.set(interfaceId, { hash, itemId, timestamp: Date.now() });

    const db = await this.initDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_HASHES], 'readwrite');
        const store = tx.objectStore(STORE_HASHES);
        store.put({ interfaceId, hash, itemId, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getContentHash(interfaceId: string): Promise<{ hash: string; itemId: string } | null> {
    if (this.memoryHashes.has(interfaceId)) {
      return this.memoryHashes.get(interfaceId)!;
    }

    const db = await this.initDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_HASHES], 'readonly');
        const store = tx.objectStore(STORE_HASHES);
        const req = store.get(interfaceId);
        req.onsuccess = () => {
          if (req.result) {
            this.memoryHashes.set(interfaceId, req.result);
            resolve(req.result);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async clearActiveJob(): Promise<void> {
    if (this.activeJobId) {
      this.memoryJobs.delete(this.activeJobId);
      this.saveActiveJobIdToLocalStorage(null);
    }
  }

  private saveJobToLocalStorageFallback(job: CaptureJob) {
    if (typeof localStorage === 'undefined') return;
    try {
      // Only keep small summary in localStorage to prevent quota errors
      const slim = {
        id: job.id,
        status: job.status,
        scope: job.scope,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        totalInterfaces: job.totalInterfaces,
        progress: job.progress,
        diagnostics: job.diagnostics,
      };
      localStorage.setItem(`axon_job_${job.id}`, JSON.stringify(slim));
    } catch {
      // Quota exceeded or restricted
    }
  }

  private loadJobFromLocalStorageFallback(jobId: string): CaptureJob | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(`axon_job_${jobId}`);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        items: {},
      };
    } catch {
      return null;
    }
  }
}

export const captureJobStore = new CaptureJobStore();
