/**
 * Universal offline mutation queue (طابور العمليات دون اتصال).
 *
 * EVERY write action across the app funnels through `apiMutate()`: when the
 * network fails, the payload is persisted in IndexedDB together with the
 * endpoint metadata + timestamp and flushed chronologically (last-write-wins
 * per record — the server re-validates scope and business rules on sync).
 */

import {
  MUTATION_STORE,
  isNetworkError,
  isOnline,
  openOfflineDb,
  type HttpStatusError,
} from "./offline-db";

export type MutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export type QueuedMutation = {
  id: string;
  url: string;
  method: MutationMethod;
  /** JSON-serializable body (or null for bodyless DELETEs). */
  body: unknown;
  /** Original local action moment (ISO) — chronological sync order. */
  createdAt: string;
  attempts: number;
  label?: string;
};

export type MutationSyncResult = {
  synced: number;
  failed: { mutation: QueuedMutation; error: string }[];
  pending: number;
};

const LS_MUTATIONS_KEY = "tayoo_offline_mutations_v1";

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

async function idbAdd(m: QueuedMutation): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(MUTATION_STORE, "readwrite");
    t.objectStore(MUTATION_STORE).put(m);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("idb-put"));
  });
}

async function idbDel(id: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(MUTATION_STORE, "readwrite");
    t.objectStore(MUTATION_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("idb-del"));
  });
}

async function idbAll(): Promise<QueuedMutation[]> {
  const db = await openOfflineDb();
  return new Promise<QueuedMutation[]>((resolve, reject) => {
    const t = db.transaction(MUTATION_STORE, "readonly");
    const req = t.objectStore(MUTATION_STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedMutation[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("idb-read"));
  });
}

function lsAll(): QueuedMutation[] {
  try {
    const raw = window.localStorage.getItem(LS_MUTATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWrite(rows: QueuedMutation[]) {
  try {
    window.localStorage.setItem(LS_MUTATIONS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

/* ---------------- public API ---------------- */

export async function enqueueMutation(input: {
  url: string;
  method: MutationMethod;
  body?: unknown;
  label?: string;
}): Promise<QueuedMutation> {
  const m: QueuedMutation = {
    id: makeId(),
    url: input.url,
    method: input.method,
    body: input.body ?? null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    label: input.label,
  };
  try {
    await idbAdd(m);
  } catch {
    /* fall through */
  }
  if (typeof window !== "undefined") lsWrite([...lsAll().filter((x) => x.id !== m.id), m]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tayoo:queue-changed"));
  }
  return m;
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  let rows: QueuedMutation[] = [];
  try {
    rows = await idbAll();
  } catch {
    rows = [];
  }
  if (typeof window !== "undefined") {
    const ls = lsAll();
    const ids = new Set(rows.map((r) => r.id));
    rows = [...rows, ...ls.filter((r) => !ids.has(r.id))];
  }
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function queuedMutationCount(): Promise<number> {
  return (await getQueuedMutations()).length;
}

export async function removeQueuedMutation(id: string): Promise<void> {
  try {
    await idbDel(id);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") lsWrite(lsAll().filter((m) => m.id !== id));
}

export async function clearQueuedMutations(): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(MUTATION_STORE, "readwrite");
      t.objectStore(MUTATION_STORE).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error("idb-clear"));
    });
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") lsWrite([]);
}

/* ---------------- flush + auto-queueing fetch ---------------- */

/**
 * Flushes the mutation queue chronologically. Permanent failures (4xx scope /
 * validation / unknown records) are dropped and reported; transient failures
 * (offline, 5xx, 401) keep the mutation queued. Conflict resolution is
 * last-write-wins: items replay in original order so the newest change wins.
 */
export async function syncMutationQueue(): Promise<MutationSyncResult> {
  const pending = await getQueuedMutations();
  if (pending.length === 0) return { synced: 0, failed: [], pending: 0 };
  if (!isOnline()) return { synced: 0, failed: [], pending: pending.length };

  let synced = 0;
  const failed: MutationSyncResult["failed"] = [];
  for (const m of pending) {
    try {
      const res = await fetch(m.url, {
        method: m.method,
        headers: { "Content-Type": "application/json" },
        body: m.body == null ? undefined : JSON.stringify(m.body),
      });
      if (res.ok) {
        await removeQueuedMutation(m.id);
        synced += 1;
        continue;
      }
      if (res.status === 401 || res.status >= 500) break; // retry later
      let message = "تعذرت مزامنة العملية";
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        /* keep default */
      }
      await removeQueuedMutation(m.id);
      failed.push({ mutation: m, error: message });
    } catch (err) {
      if (!isNetworkError(err)) {
        await removeQueuedMutation(m.id);
        failed.push({ mutation: m, error: "تعذرت مزامنة العملية" });
      }
      break; // connectivity lost — keep the rest queued
    }
  }
  return { synced, failed, pending: await queuedMutationCount() };
}

export type MutateOutcome<T> =
  | { ok: true; data: T; queued: false }
  | { ok: true; data: null; queued: true };

/**
 * Universal write helper: tries the request live, and on network failure
 * persists {url, method, body, timestamp} into the offline queue instead of
 * failing. Throws for genuine server errors (4xx/5xx + message).
 */
export async function apiMutate<T>(
  url: string,
  method: MutationMethod,
  body?: unknown,
  label?: string
): Promise<MutateOutcome<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null && method === "DELETE" ? undefined : JSON.stringify(body ?? null),
    });
    if (!res.ok) {
      let message = `خطأ ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        /* keep default */
      }
      const err = new Error(message) as HttpStatusError;
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { ok: true, data, queued: false };
  } catch (err) {
    if ((err as HttpStatusError)?.status || !isNetworkError(err)) throw err;
    await enqueueMutation({ url, method, body: body ?? null, label });
    return { ok: true, data: null, queued: true };
  }
}

