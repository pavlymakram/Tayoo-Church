"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { useAuth } from "@/components/providers/auth-provider";

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
    const res = await fetch("/api/attendance/instant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, qrCodeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "تعذر تسجيل الحضور");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
    toast.success(`تم تسجيل ${data.student.fullName} وإضافة ${data.transaction.pointsAmount} تايو`);
  }

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
            <div className="glass rounded-3xl p-4">
              <QrScanner autoStart keepOpen onScan={scan} />
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

