/**
 * Saved data: one store of string values by key, gzipped on disk. Values are preloaded at boot
 * (`initStore`), so reads stay synchronous; writes go out behind the game, one at a time, and a
 * failure is reported (`onStoreError`) instead of lost.
 *
 * The backend is picked at runtime:
 * - the desktop app: files in the user's app data folder, through the Electron preload (`electron/`)
 * - a browser (`npm run dev`): IndexedDB. Values once kept in `localStorage` under
 *   `saturday-gridiron-<key>` are moved over on first load.
 * - Node (tests, reports): memory only
 */

/** Bytes by key. Keys are lowercase letters, digits and dashes (the desktop backend uses them as file names). */
interface Backend {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, data: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

/** What `electron/preload.cjs` exposes. */
declare global {
  interface Window {
    gridironStore?: Backend;
  }
}

const KEY_RE = /^[a-z0-9-]+$/;
const LEGACY_PREFIX = 'saturday-gridiron-';

const cache = new Map<string, string>();
let backend: Backend | null = null;
let queue: Promise<void> = Promise.resolve();
const listeners: ((key: string, err: unknown) => void)[] = [];

/** Load `keys` from storage. Call once at boot, before anything reads. */
export async function initStore(keys: string[]): Promise<void> {
  backend = pickBackend();
  if (!backend) return;
  for (const key of keys) {
    checkKey(key);
    try {
      const data = await backend.read(key);
      if (data) cache.set(key, await gunzip(data));
      else await migrateLegacy(key);
    } catch (err) {
      report(key, err);
    }
  }
}

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

/**
 * A value that wasn't preloaded at boot (a dynasty's save): read once from storage, then cached.
 * Queued writes finish first, so it never reads a value that's still being written or removed.
 */
export async function loadItem(key: string): Promise<string | null> {
  checkKey(key);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const b = backend;
  if (!b) return null;
  await queue;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const data = await b.read(key);
    if (!data) return null;
    const value = await gunzip(data);
    cache.set(key, value);
    return value;
  } catch (err) {
    report(key, err);
    return null;
  }
}

export function setItem(key: string, value: string): void {
  checkKey(key);
  cache.set(key, value);
  enqueue(key, async (b) => b.write(key, await gzip(value)));
}

export function removeItem(key: string): void {
  cache.delete(key);
  enqueue(key, (b) => b.remove(key));
}

/** Called when a write or read fails, with the key. */
export function onStoreError(cb: (key: string, err: unknown) => void): void {
  listeners.push(cb);
}

/** Resolves once every queued write has finished. */
export function flushStore(): Promise<void> {
  return queue;
}

function enqueue(key: string, job: (b: Backend) => Promise<void>): void {
  const b = backend;
  if (!b) return;
  queue = queue.then(() => job(b)).catch((err) => report(key, err));
}

function report(key: string, err: unknown): void {
  console.error(`storage: ${key}`, err);
  for (const cb of listeners) cb(key, err);
}

function checkKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`bad storage key: ${key}`);
}

function pickBackend(): Backend | null {
  if (typeof window === 'undefined') return null;
  if (window.gridironStore) return window.gridironStore;
  if (typeof indexedDB !== 'undefined') return idbBackend();
  return null;
}

/** A value left in `localStorage` by an older build: move it into the store. */
async function migrateLegacy(key: string): Promise<void> {
  let old: string | null = null;
  try {
    old = localStorage.getItem(LEGACY_PREFIX + key);
  } catch {
    return;
  }
  if (old === null) return;
  cache.set(key, old);
  await backend!.write(key, await gzip(old));
  localStorage.removeItem(LEGACY_PREFIX + key);
}

// ------------------------------------------------------------ gzip

async function gzip(s: string): Promise<Uint8Array> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ------------------------------------------------------------ IndexedDB

function idbBackend(): Backend {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('saturday-gridiron', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const tx = (await open()).transaction('saves', mode);
    const req = f(tx.objectStore('saves'));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    read: async (key) => (await run<Uint8Array | undefined>('readonly', (s) => s.get(key))) ?? null,
    write: (key, data) => run('readwrite', (s) => s.put(data, key)),
    remove: (key) => run('readwrite', (s) => s.delete(key)),
  };
}
