/**
 * Shared offline storage core (IndexedDB with localStorage fallback).
 *
 * SAME database as the attendance queue (`tayoo-offline`), upgraded to v2 so
 * the existing `attendance-queue` store is preserved:
 *   - `attendance-queue` — QR scans (owned by offline-queue.ts, v1 store)
 *   - `kv`              — cached session snapshot + GET API responses
 *   - `mutations`       — universal write queue (offline-mutations.ts)
 */

export const OFFLINE_DB_NAME = "tayoo-offline";
export const OFFLINE_DB_VERSION = 2;
export const SCAN_STORE = "attendance-queue";
export const KV_STORE = "kv";
export const MUTATION_STORE = "mutations";

const LS_PREFIX = "tayoo_offline_kv_";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/** True when a fetch failure means "no connectivity" (queue, don't logout). */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /fetch|network|load failed|failed to fetch|offline/i.test(msg);
}

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCAN_STORE)) {
        db.createObjectStore(SCAN_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("indexeddb-open"));
    };
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openOfflineDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let value: T;
        try {
          const req = run(t.objectStore(store));
          req.onsuccess = () => {
            value = req.result;
          };
          req.onerror = () => reject(req.error ?? new Error("idb-tx"));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("idb-tx"));
          return;
        }
        t.oncomplete = () => resolve(value);
        t.onerror = () => reject(t.error ?? new Error("idb-tx"));
      })
  );
}

/** Persisted key/value entry (session snapshot, GET responses). */
export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await tx(KV_STORE, "readwrite", (s) => s.put({ key, value, at: Date.now() }));
  } catch {
    /* fall through to localStorage mirror */
  }
  try {
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify({ value, at: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

export async function kvGet<T>(key: string): Promise<{ value: T; at: number } | null> {
  try {
    const row = await tx<{ key: string; value: T; at: number } | undefined>(
      KV_STORE,
      "readonly",
      (s) => s.get(key)
    );
    if (row) return { value: row.value, at: row.at };
  } catch {
    /* fall through to mirror */
  }
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; at: number };
    return parsed && "value" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    await tx(KV_STORE, "readwrite", (s) => s.delete(key));
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/* ---------------- GET API response cache ---------------- */

export function apiCacheKey(url: string): string {
  return `api:${url}`;
}

export async function cacheApiResponse(url: string, data: unknown): Promise<void> {
  await kvSet(apiCacheKey(url), data);
}

export async function getCachedApiResponse<T>(url: string): Promise<{ data: T; at: number } | null> {
  const hit = await kvGet<T>(apiCacheKey(url));
  return hit ? { data: hit.value, at: hit.at } : null;
}

export type HttpStatusError = Error & { status?: number };

/**
 * GET with offline read support: network-first, persists every 200 response,
 * falls back to the cached copy when the network fails. Throws an
 * HttpStatusError (with `.status`) for real server errors so callers can
 * still tell 401/403/404 apart from "offline" (status 0).
 */
export async function fetchJsonWithCache<T>(
  url: string,
  init?: RequestInit
): Promise<{ data: T; fromCache: boolean }> {
  const method = (init?.method || "GET").toUpperCase();
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      let message = `خطأ ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* keep default */
      }
      const err = new Error(message) as HttpStatusError;
      err.status = res.status;
      throw err;
    }
    const data = (await res.json()) as T;
    if (method === "GET") void cacheApiResponse(url, data);
    return { data, fromCache: false };
  } catch (err) {
    if ((err as HttpStatusError)?.status || method !== "GET" || !isNetworkError(err)) throw err;
    const cached = await getCachedApiResponse<T>(url);
    if (cached) return { data: cached.data, fromCache: true };
    const offline = new Error("لا يوجد اتصال بالإنترنت ولا توجد نسخة محفوظة") as HttpStatusError;
    offline.status = 0;
    throw offline;
  }
}

