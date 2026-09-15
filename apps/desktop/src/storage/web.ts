import {
  emptyProfile,
  type AttemptRecord,
  type CircuitRecord,
  type InferredPrior,
  type MisconceptionEvent,
  type Profile,
  type SessionRecord,
  type StorageAdapter,
} from './types.js';

/**
 * Browser-backed storage.
 *
 * Uses IndexedDB directly rather than a wrapper: the access pattern is
 * append-and-read-all, which needs none of what a query layer provides. This
 * adapter is what lets the full app run and be verified without a Tauri
 * toolchain installed.
 */

const DB_NAME = 'engineering-trainer';
const DB_VERSION = 2;

const STORES = {
  profile: 'profile',
  attempts: 'attempts',
  misconceptions: 'misconceptions',
  sessions: 'sessions',
  priors: 'priors',
  circuits: 'circuits',
} as const;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.profile)) db.createObjectStore(STORES.profile);
      if (!db.objectStoreNames.contains(STORES.attempts)) db.createObjectStore(STORES.attempts, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.misconceptions)) db.createObjectStore(STORES.misconceptions, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.priors)) db.createObjectStore(STORES.priors, { keyPath: 'kcId' });
      if (!db.objectStoreNames.contains(STORES.circuits)) db.createObjectStore(STORES.circuits, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class WebStorageAdapter implements StorageAdapter {
  readonly kind = 'web' as const;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    this.db = await open();
  }

  private get database(): IDBDatabase {
    if (!this.db) throw new Error('WebStorageAdapter: init() was not awaited');
    return this.db;
  }

  async getProfile(): Promise<Profile> {
    const stored = await run<Profile | undefined>(this.database, STORES.profile, 'readonly', (s) => s.get('singleton'));
    // A profile written before streaks and crests existed is missing those
    // fields; merging over the empty profile fills them without a migration.
    return stored ? { ...emptyProfile(), ...stored } : emptyProfile();
  }

  async saveProfile(profile: Profile): Promise<void> {
    await run(this.database, STORES.profile, 'readwrite', (s) => s.put(profile, 'singleton'));
  }

  async appendAttempt(attempt: AttemptRecord): Promise<void> {
    // `add` rather than `put`: an id collision means a logic error upstream and
    // should surface loudly, not silently overwrite recorded evidence.
    await run(this.database, STORES.attempts, 'readwrite', (s) => s.add(serialise(attempt)));
  }

  async listAttempts(): Promise<AttemptRecord[]> {
    const rows = await run<AttemptRecord[]>(this.database, STORES.attempts, 'readonly', (s) => s.getAll());
    return rows.map(reviveAttempt).sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  async recordMisconceptions(events: MisconceptionEvent[]): Promise<void> {
    for (const event of events) {
      await run(this.database, STORES.misconceptions, 'readwrite', (s) => s.put(event));
    }
  }

  async listMisconceptionEvents(): Promise<MisconceptionEvent[]> {
    return run<MisconceptionEvent[]>(this.database, STORES.misconceptions, 'readonly', (s) => s.getAll());
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await run(this.database, STORES.sessions, 'readwrite', (s) => s.put(session));
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await run<SessionRecord[]>(this.database, STORES.sessions, 'readonly', (s) => s.getAll());
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async savePriors(priors: InferredPrior[]): Promise<void> {
    for (const prior of priors) {
      await run(this.database, STORES.priors, 'readwrite', (s) => s.put(prior));
    }
  }

  async listPriors(): Promise<InferredPrior[]> {
    return run<InferredPrior[]>(this.database, STORES.priors, 'readonly', (s) => s.getAll());
  }

  async saveCircuit(circuit: CircuitRecord): Promise<void> {
    await run(this.database, STORES.circuits, 'readwrite', (s) => s.put(circuit));
  }

  async listCircuits(): Promise<CircuitRecord[]> {
    const rows = await run<CircuitRecord[]>(this.database, STORES.circuits, 'readonly', (s) => s.getAll());
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteCircuit(id: string): Promise<void> {
    await run(this.database, STORES.circuits, 'readwrite', (s) => s.delete(id));
  }

  async reset(): Promise<void> {
    for (const store of Object.values(STORES)) {
      await run(this.database, store, 'readwrite', (s) => s.clear());
    }
  }
}

/** Dates survive structured clone, but normalising keeps the two adapters aligned. */
const serialise = (attempt: AttemptRecord): AttemptRecord => ({ ...attempt, at: new Date(attempt.at) });
const reviveAttempt = (row: AttemptRecord): AttemptRecord => ({ ...row, at: new Date(row.at) });
