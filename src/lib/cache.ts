"use client";

export type CacheEntry<T> = { data: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Minimal SWR-style cache: instant stale render + background revalidate.
 * Keeps "إدارة المخدومين" and dashboard lists feeling instantaneous
 * without adding a new dependency.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 15_000
): Promise<{ data: T; cached: boolean }> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return { data: hit.data, cached: true };
  const data = await fetcher();
  store.set(key, { data, at: Date.now() });
  return { data, cached: false };
}

export function primeCache<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
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
