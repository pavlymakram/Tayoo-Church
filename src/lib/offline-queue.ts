/**
 * Offline attendance queue (طابور الحضور دون اتصال).
 *
 * When offline, QR scans persist locally in IndexedDB (localStorage fallback)
 * with the exact local scan timestamp. They sync to the server automatically
 * in the background and on demand via the "مزامنة الحضور" button.
 *
 * The server enforces every business rule during sync (notably the Liturgy
 * 08:00 AM Africa/Cairo cutoff) against the original `scannedAt` timestamp.
 */

export type OfflineScanKind = "mass" | "service";

export type QueuedScan = {
  id: string;
  kind: OfflineScanKind;
  qrCodeId: string;
  /** Local scan timestamp (ISO) — the source of truth for cutoff rules. */
  scannedAt: string;
  attempts: number;
};

export type SyncResult = {
  synced: number;
  failed: { scan: QueuedScan; error: string }[];
  pending: number;
};

const DB_NAME = "tayoo-offline";
const DB_VERSION = 1;
const STORE_NAME = "attendance-queue";
const LS_KEY = "tayoo_offline_attendance_v1";

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb-open"));
  });
}

async function idbPut(scan: QueuedScan): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(scan);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb-put"));
    });
  } finally {
    db.close();
  }
}

async function idbAll(): Promise<QueuedScan[]> {
  const db = await openDb();
  try {
    return await new Promise<QueuedScan[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as QueuedScan[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error("indexeddb-read"));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb-delete"));
    });
  } finally {
    db.close();
  }
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb-clear"));
    });
  } finally {
    db.close();
  }
}

/* ---------------- localStorage fallback ---------------- */

function lsAll(): QueuedScan[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWrite(rows: QueuedScan[]) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* storage unavailable — the in-memory batch is still used */
  }
}

/* ---------------- public queue API ---------------- */

/** Persists one scan locally; never throws (falls back gracefully). */
export async function enqueueOfflineScan(input: {
  kind: OfflineScanKind;
  qrCodeId: string;
}): Promise<QueuedScan> {
  const scan: QueuedScan = {
    id: makeId(),
    kind: input.kind,
    qrCodeId: input.qrCodeId.trim(),
    scannedAt: new Date().toISOString(),
    attempts: 0,
  };
  try {
    await idbPut(scan);
  } catch {
    try {
      lsWrite([...lsAll(), scan]);
    } catch {
      /* best effort */
    }
  }
  return scan;
}

export async function getQueuedScans(): Promise<QueuedScan[]> {
  try {
    const rows = await idbAll();
    return rows.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
  } catch {
    if (typeof window === "undefined") return [];
    return lsAll().sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
  }
}

export async function queuedScanCount(): Promise<number> {
  return (await getQueuedScans()).length;
}

export async function removeQueuedScan(id: string): Promise<void> {
  try {
    await idbDelete(id);
  } catch {
    /* fall through to the localStorage mirror */
  }
  if (typeof window !== "undefined") {
    lsWrite(lsAll().filter((s) => s.id !== id));
  }
}

export async function clearQueuedScans(): Promise<void> {
  try {
    await idbClear();
  } catch {
    /* fall through */
  }
  if (typeof window !== "undefined") lsWrite([]);
}

type BatchItemResult = {
  clientId: string | null;
  ok: boolean;
  retryable: boolean;
  error?: string;
};

/**
 * Pushes every queued scan to the server. Permanent failures (unknown QR,
 * expired Liturgy cutoff measured against the ORIGINAL scan time, …) are
 * dropped from the queue and reported; transient failures (offline, 5xx,
 * expired session) stay queued for the next attempt.
 */
export async function syncOfflineQueue(): Promise<SyncResult> {
  const pending = await getQueuedScans();
  if (pending.length === 0) return { synced: 0, failed: [], pending: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: [], pending: pending.length };
  }

  // Preferred path: one batched request.
  try {
    const res = await fetch("/api/attendance/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scans: pending.map((s) => ({
          clientId: s.id,
          kind: s.kind,
          qrCodeId: s.qrCodeId,
          scannedAt: s.scannedAt,
        })),
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: BatchItemResult[] };
      const byId = new Map((data.results ?? []).map((r) => [r.clientId, r]));
      let synced = 0;
      const failed: SyncResult["failed"] = [];
      for (const scan of pending) {
        const r = byId.get(scan.id);
        if (!r) continue; // unknown outcome — keep queued
        if (r.ok) {
          await removeQueuedScan(scan.id);
          synced += 1;
        } else if (!r.retryable) {
          await removeQueuedScan(scan.id);
          failed.push({ scan, error: r.error || "تعذر مزامنة المسح" });
        }
      }
      return { synced, failed, pending: await queuedScanCount() };
    }
    if (res.status === 401) return { synced: 0, failed: [], pending: pending.length };
    if (res.status === 404) throw new Error("batch-unsupported");
    // Any other server error — fall through to the per-scan path below.
  } catch {
    // Network dropped mid-sync (or batch unsupported) — per-scan fallback.
  }

  let synced = 0;
  const failed: SyncResult["failed"] = [];
  for (const scan of pending) {
    try {
      const res = await fetch("/api/attendance/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: scan.kind, qrCodeId: scan.qrCodeId, scannedAt: scan.scannedAt }),
      });
      if (res.ok) {
        await removeQueuedScan(scan.id);
        synced += 1;
        continue;
      }
      if (res.status === 401 || res.status >= 500) break; // retry later
      let message = "تعذر مزامنة المسح";
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* keep default */
      }
      await removeQueuedScan(scan.id);
      failed.push({ scan, error: message });
    } catch {
      break; // connectivity lost again — keep the rest queued
    }
  }
  return { synced, failed, pending: await queuedScanCount() };
}

