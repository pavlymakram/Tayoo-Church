"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { can as canDo, type Capability } from "@/lib/permissions";
import { normalizeRole, type Role } from "@/lib/utils";
import { isNetworkError, isOnline, kvDel, kvGet, kvSet } from "@/lib/offline-db";
import { queuedMutationCount, syncMutationQueue } from "@/lib/offline-mutations";
import { queuedScanCount, syncOfflineQueue } from "@/lib/offline-queue";

export type AppUser = {
  id: string;
  churchId: string | null;
  role: Role;
  fullName: string;
  username?: string | null;
  phone: string;
  secondaryPhone?: string | null;
  address?: string | null;
  grade?: string | null;
  birthDate?: string | null;
  confessionFather?: string | null;
  fatherJob?: string | null;
  motherJob?: string | null;
  isMotherWorking?: boolean;
  qrCodeId: string;
  createdAt?: string;
  initialPassword?: string | null;
  phaseId?: string | null;
  phaseName?: string | null;
  phaseAbbreviation?: string | null;
  className?: string | null;
  sector?: string | null;
  isFirstAdmin?: boolean;
};

export type AppChurch = {
  id: string;
  name: string;
  abbreviation?: string;
  licenseKey?: string;
};

type AuthState = {
  user: AppUser | null;
  church: AppChurch | null;
  role: Role;
  loading: boolean;
  /** True when the session shown comes from the offline snapshot. */
  offlineSession: boolean;
  can: (capability: Capability) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: AppUser, church: AppChurch | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Offline-first session snapshot.
 * The session cookie is HttpOnly (unreadable from JS), so the last verified
 * user/church profile is mirrored into IndexedDB + localStorage on every
 * successful `/api/auth/me`. On network failure the snapshot restores the
 * login state instead of dropping the user to `/login`.
 */
const SESSION_SNAPSHOT_KEY = "auth:session-snapshot";

type SessionSnapshot = { user: AppUser; church: AppChurch | null; at: number };

async function saveSessionSnapshot(user: AppUser, church: AppChurch | null) {
  try {
    await kvSet(SESSION_SNAPSHOT_KEY, { user, church, at: Date.now() } satisfies SessionSnapshot);
  } catch {
    /* best effort */
  }
}

async function loadSessionSnapshot(): Promise<SessionSnapshot | null> {
  try {
    const hit = await kvGet<SessionSnapshot>(SESSION_SNAPSHOT_KEY);
    return hit ? hit.value : null;
  } catch {
    return null;
  }
}

async function clearSessionSnapshot() {
  try {
    await kvDel(SESSION_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [church, setChurch] = useState<AppChurch | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        // A genuine 401/404 while ONLINE means logged out. A failure while
        // OFFLINE restores the snapshot — never redirect to /login offline.
        if (!isOnline()) {
          const snap = await loadSessionSnapshot();
          if (snap?.user) {
            setUser(snap.user);
            setChurch(snap.church);
            setOfflineSession(true);
            return;
          }
        } else if (res.status === 401 || res.status === 404) {
          await clearSessionSnapshot();
        }
        setUser(null);
        setChurch(null);
        setOfflineSession(false);
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setChurch(data.church);
      setOfflineSession(false);
      void saveSessionSnapshot(data.user, data.church ?? null);
    } catch (err) {
      // No redirect to /login on connectivity loss — stay logged in offline.
      if (isNetworkError(err)) {
        const snap = await loadSessionSnapshot();
        if (snap?.user) {
          setUser(snap.user);
          setChurch(snap.church);
          setOfflineSession(true);
          return;
        }
      }
      setUser(null);
      setChurch(null);
      setOfflineSession(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Revalidate the session whenever connectivity returns (snapshot → live).
  useEffect(() => {
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  const logout = useCallback(async () => {
    const currentRole = normalizeRole(user?.role);
    const isStaffRole =
      currentRole === "PHASE_SERVANT" ||
      currentRole === "PHASE_ADMIN" ||
      currentRole === "CHURCH_ADMIN" ||
      currentRole === "SUPER_ADMIN";
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Cookie is HttpOnly — local state still clears even if the call fails.
    }
    await clearSessionSnapshot();
    setUser(null);
    setChurch(null);
    // Absolute route isolation: staff gates live under /admin121210,
    // the student portal lives under `/` — never cross them.
    window.location.href = isStaffRole ? "/admin121210" : "/";
  }, [user?.role]);

  const setAuth = useCallback((u: AppUser, c: AppChurch | null) => {
    setUser(u);
    setChurch(c);
    setOfflineSession(false);
    void saveSessionSnapshot(u, c);
  }, []);

  const role = normalizeRole(user?.role);
  const can = useCallback((capability: Capability) => canDo(role, capability), [role]);

  const value = useMemo(
    () => ({ user, church, role, loading, offlineSession, can, refresh, logout, setAuth }),
    [user, church, role, loading, offlineSession, can, refresh, logout, setAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Global offline status + background sync                             */
/* ------------------------------------------------------------------ */

type OfflineState = {
  online: boolean;
  /** Total locally saved operations (mutations + attendance scans). */
  pendingCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
};

const OfflineContext = createContext<OfflineState>({
  online: true,
  pendingCount: 0,
  syncing: false,
  syncNow: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

async function totalPending(): Promise<number> {
  try {
    const [m, s] = await Promise.all([queuedMutationCount(), queuedScanCount()]);
    return m + s;
  } catch {
    return 0;
  }
}

/**
 * Listens for connectivity changes and flushes BOTH queues in the background
 * (universal mutations first, then attendance scans), with a toast when
 * offline data syncs successfully. Dispatches `tayoo:offline-synced` so
 * visible lists can re-fetch after a sync completes.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(() => isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    setPendingCount(await totalPending());
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const mutations = await syncMutationQueue();
      const scans = await syncOfflineQueue();
      const synced = mutations.synced + scans.synced;
      const failed = [...mutations.failed, ...scans.failed];
      setPendingCount(await totalPending());
      if (synced > 0) {
        toast.success(`تمت مزامنة ${synced} من العمليات المحفوظة بنجاح`);
      }
      for (const f of failed) toast.error(f.error);
      if (synced > 0) {
        window.dispatchEvent(new CustomEvent("tayoo:offline-synced"));
      }
    } catch {
      /* silent background retry */
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refreshPending();
    const onOnline = () => {
      setOnline(true);
      void (async () => {
        await refreshPending();
        await syncNow();
      })();
    };
    const onOffline = () => {
      setOnline(false);
      void refreshPending();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    const onQueueChanged = () => void refreshPending();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("tayoo:queue-changed", onQueueChanged);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => {
      void (async () => {
        const n = await totalPending();
        setPendingCount(n);
        if (n > 0 && isOnline()) await syncNow();
      })();
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("tayoo:queue-changed", onQueueChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [refreshPending, syncNow]);

  const value = useMemo(
    () => ({ online, pendingCount, syncing, syncNow }),
    [online, pendingCount, syncing, syncNow]
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** App-wide connectivity banner — the required offline status indicator. */
export function OfflineBanner() {
  const { online, pendingCount, syncing, syncNow } = useOffline();
  const { offlineSession } = useAuth();

  if (online && pendingCount === 0 && !offlineSession) return null;

  return (
    <div
      role="status"
      className={`sticky top-0 z-50 border-b px-4 py-2 text-center text-xs font-black sm:text-sm ${
        !online
          ? "border-amber-300 bg-amber-100 text-amber-900"
          : "border-sky-300 bg-sky-100 text-sky-900"
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2">
        <span>
          {!online
            ? pendingCount > 0
              ? `جاري العمل أوفلاين - تم حفظ ${pendingCount} عمليات محلياً`
              : "جاري العمل أوفلاين — سيُحفظ أي تغيير محلياً ويُزامَن تلقائياً"
            : pendingCount > 0
              ? `عاد الاتصال — ${pendingCount} عمليات بانتظار المزامنة`
              : "عاد الاتصال — جارٍ التحقق من الجلسة..."}
        </span>
        {pendingCount > 0 && online && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="rounded-full bg-[var(--color-navy)] px-3 py-1 text-[11px] font-black text-white disabled:opacity-50"
          >
            {syncing ? "جارٍ المزامنة..." : "مزامنة الآن"}
          </button>
        )}
      </div>
    </div>
  );
}

