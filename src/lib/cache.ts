"use client";

import { cacheApiResponse, getCachedApiResponse, isNetworkError, type HttpStatusError } from "./offline-db";

export type CacheEntry<T> = { data: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Minimal SWR-style cache: instant stale render + background revalidate.
 * Keeps "إدارة المخدومين" and dashboard lists feeling instantaneous
 * without adding a new dependency.
 *
 * Offline-first: every fetcher result is persisted through the shared
 * IndexedDB cache (offline-db), and when the fetcher fails because the
 * network is down (no HTTP status — real 4xx/5xx errors are rethrown) the
 * last persisted copy is served instead, so lists open offline.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 15_000
): Promise<{ data: T; cached: boolean }> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return { data: hit.data, cached: true };
  try {
    const data = await fetcher();
    store.set(key, { data, at: Date.now() });
    void cacheApiResponse(key, data);
    return { data, cached: false };
  } catch (err) {
    const status = (err as HttpStatusError)?.status;
    if (status || !isNetworkError(err)) throw err;
    // Offline: fall back to the last copy persisted in IndexedDB.
    const persisted = await getCachedApiResponse<T>(key);
    if (persisted) {
      store.set(key, { data: persisted.data, at: persisted.at });
      return { data: persisted.data, cached: true };
    }
    throw err;
  }
}

export function primeCache<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
  void cacheApiResponse(key, data);
}

export function invalidateCache(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}?`) || key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export function clearCache() {
  store.clear();
}
