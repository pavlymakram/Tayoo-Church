"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { useAuth } from "@/components/providers/auth-provider";
import { LITURGY_CUTOFF_MESSAGE, isLiturgyScanOpen } from "@/lib/attendance";
import {
  enqueueOfflineScan,
  getQueuedScans,
  syncOfflineQueue,
  type OfflineScanKind,
} from "@/lib/offline-queue";

export default function QuickScanPage() {
  return (
    <Suspense
      fallback={
        <PageShell withStaffNav>
          <p className="py-12 text-center text-slate-500">جارٍ التحميل...</p>
        </PageShell>
      }
    >
      <QuickScanContent />
    </Suspense>
  );
}

const LABELS = {
  mass: { title: "مسح القداس", subtitle: "القداس الإلهي" },
  service: { title: "مسح الحضور", subtitle: "الخدمة / مدارس الأحد" },
} as const;

function QuickScanContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading, can } = useAuth();
  const kindParam = params.get("kind");
  const kind = kindParam === "mass" || kindParam === "service" ? kindParam : null;
  const [now, setNow] = useState(() => new Date());
  const liturgyClosed = kind === "mass" && !isLiturgyScanOpen(now);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      setQueued((await getQueuedScans()).length);
    } catch {
      /* queue unavailable — scanning still works online */
    }
  }, []);

  useEffect(() => {
    if (kind !== "mass") return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [kind]);

  const closedNotice = useMemo(
    () => (liturgyClosed ? LITURGY_CUTOFF_MESSAGE : null),
    [liturgyClosed]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/admin121210");
      return;
    }
    // Church admins curate the structure and are not part of the scanning flow.
    if (!can("scanQr")) router.replace("/servant");
  }, [user, loading, router, can]);

  async function scan(qrCodeId: string) {
    const now = new Date();
    if (kind === "mass" && !isLiturgyScanOpen(now)) {
      toast.error(LITURGY_CUTOFF_MESSAGE);
      return;
    }
    try {
      const res = await fetch("/api/attendance/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, qrCodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تسجيل الحضور");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
      toast.success(`تم تسجيل ${data.student.fullName} وإضافة ${data.transaction.pointsAmount} تايو`);
      return;
    } catch (err) {
      // Offline or spotty network → persist locally with the scan timestamp;
      // it syncs later with the cutoff still bound to THIS moment.
      const offline =
        err instanceof TypeError ||
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (err instanceof Error && /fetch|network|load failed/i.test(err.message));
      if (!offline || !kind) {
        toast.error(err instanceof Error ? err.message : "تعذر تسجيل الحضور");
        return;
      }
    }
    await enqueueOfflineScan({ kind: kind as OfflineScanKind, qrCodeId });
    await refreshQueue();
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([60, 40, 60]);
    toast.warning("لا يوجد اتصال — حُفظ المسح في طابور دون اتصال وسيُزامَن تلقائياً");
  }

  const runSync = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await syncOfflineQueue();
        setQueued(result.pending);
        if (!opts?.silent) {
          if (result.synced > 0) toast.success(`تمت مزامنة ${result.synced} من الحضور`);
          for (const f of result.failed) toast.error(f.error);
          if (result.synced === 0 && result.failed.length === 0 && result.pending > 0) {
            toast.warning(`ما زال ${result.pending} مسحاً بانتظار الاتصال`);
          } else if (result.synced === 0 && result.failed.length === 0) {
            toast.success("لا يوجد حضور معلّق للمزامنة");
          }
        } else if (result.synced > 0) {
          toast.success(`زُامن ${result.synced} من الحضور تلقائياً`);
          for (const f of result.failed) toast.error(f.error);
        }
      } catch {
        if (!opts?.silent) toast.error("تعذرت المزامنة — سيُعاد المحاولة تلقائياً");
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    []
  );

  // Automatic background sync: connectivity restored, page visible again,
  // and a periodic retry while scans remain queued.
  useEffect(() => {
    void refreshQueue();
    const onOnline = () => {
      setOnline(true);
      void runSync({ silent: true });
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync({ silent: true });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => void runSync({ silent: true }), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [refreshQueue, runSync]);

  return (
    <>
      <PageShell withStaffNav>
        {!kind ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-black text-[var(--color-navy)]">مسح سريع</h1>
            <Action
              href="/servant/quick-scan?kind=mass"
              title="مسح القداس"
              subtitle="القداس الإلهي"
              description="تسجيل حضور القداس وإضافة نقاط القداس فوراً"
            />
            <Action
              href="/servant/quick-scan?kind=service"
              title="مسح الحضور"
              subtitle="الخدمة / مدارس الأحد"
              description="تسجيل حضور الخدمة وإضافة نقاط الحضور فوراً"
            />
            <Action
              href="/servant/scan"
              title="مسح مخصص / هدايا"
              subtitle="مناسبة ونقاط مخصصة"
              description="اختر المناسبة والنقاط يدوياً"
            />
          </div>
        ) : (
          <div>
            <Link href="/servant/quick-scan" className="text-sm font-bold text-slate-500">
              ← تغيير نوع المسح
            </Link>
            <h1 className="my-4 text-2xl font-black text-[var(--color-navy)]">{LABELS[kind].title}</h1>
            <p className="mb-1 text-sm font-bold text-[var(--color-gold)]">{LABELS[kind].subtitle}</p>
            <p className="mb-4 text-sm text-slate-600">
              الكاميرا مفتوحة الآن؛ يتم تسجيل كل QR تلقائياً وتبقى جاهزة للمخدوم التالي.
            </p>
            {closedNotice && (
              <div
                role="alert"
                className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-relaxed text-rose-700"
              >
                {closedNotice}
              </div>
            )}
            <div className="glass rounded-3xl p-4">
              {liturgyClosed ? (
                <p className="py-10 text-center text-sm font-bold text-slate-500">
                  تم إغلاق مسح القداس — متاح مجدداً قبل الساعة 8:00 صباحاً.
                </p>
              ) : (
                <QrScanner autoStart keepOpen onScan={scan} />
              )}
            </div>

            {/* Offline queue status + manual sync (مزامنة الحضور). */}
            <div
              className={`mt-4 rounded-3xl border p-4 text-sm font-bold leading-relaxed ${
                !online
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : queued > 0
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  {!online
                    ? "أنت دون اتصال — تُحفظ المسوحات محلياً وتُزامَن تلقائياً عند عودة الشبكة."
                    : queued > 0
                      ? `يوجد ${queued} مسح معلّق بانتظار المزامنة.`
                      : "متصل — لا يوجد حضور معلّق."}
                </p>
                <button
                  type="button"
                  onClick={() => void runSync()}
                  disabled={syncing || queued === 0}
                  className="rounded-2xl bg-[var(--color-navy)] px-4 py-2 text-sm font-black text-white disabled:opacity-40"
                >
                  {syncing ? "جارٍ المزامنة..." : `مزامنة الحضور${queued > 0 ? ` (${queued})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

function Action({
  href,
  title,
  subtitle,
  description,
}: {
  href: string;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <Link href={href} className="block rounded-3xl bg-[var(--color-emerald)] p-5 text-white shadow-lg">
      <p className="text-xl font-black">{title}</p>
      <p className="mt-1 text-xs font-bold text-teal-50/90">{subtitle}</p>
      <p className="mt-1 text-sm text-teal-50">{description}</p>
    </Link>
  );
}

