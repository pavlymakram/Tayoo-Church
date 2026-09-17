"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { QrScanner } from "@/components/scanner/qr-scanner";

export default function QuickScanPage() {
  return <Suspense fallback={<PageShell withStaffNav><p className="py-12 text-center text-slate-500">جارٍ التحميل...</p></PageShell>}><QuickScanContent /></Suspense>;
}

function QuickScanContent() {
  const params = useSearchParams();
  const kind = params.get("kind") === "mass" || params.get("kind") === "service" ? params.get("kind") : null;
  async function scan(qrCodeId: string) {
    const res = await fetch("/api/attendance/instant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, qrCodeId }) });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "تعذر تسجيل الحضور"); return; }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
    toast.success(`تم تسجيل ${data.student.fullName} وإضافة ${data.transaction.pointsAmount} تايو`);
  }
  return <><PageShell withStaffNav>
    {!kind ? <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--color-navy)]">مسح سريع</h1>
      <Action href="/servant/quick-scan?kind=mass" title="مسح سريع: القداس" description="تسجيل الحضور وإضافة نقاط القداس فوراً" />
      <Action href="/servant/quick-scan?kind=service" title="مسح سريع: الخدمة" description="تسجيل الحضور وإضافة نقاط الخدمة فوراً" />
      <Action href="/servant/scan" title="مسح مخصص / هدايا وتخصيص" description="اختر المناسبة والنقاط يدوياً" />
    </div> : <div><Link href="/servant/quick-scan" className="text-sm font-bold text-slate-500">← تغيير نوع المسح</Link><h1 className="my-4 text-2xl font-black text-[var(--color-navy)]">{kind === "mass" ? "مسح سريع: القداس" : "مسح سريع: الخدمة"}</h1><p className="mb-4 text-sm text-slate-600">الكاميرا مفتوحة الآن؛ يتم تسجيل كل QR تلقائياً وتبقى جاهزة للمخدوم التالي.</p><div className="glass rounded-3xl p-4"><QrScanner autoStart keepOpen onScan={scan} /></div></div>}
  </PageShell><StaffBottomNav /></>;
}
function Action({ href, title, description }: { href: string; title: string; description: string }) { return <Link href={href} className="block rounded-3xl bg-[var(--color-emerald)] p-5 text-white shadow-lg"><p className="text-xl font-black">{title}</p><p className="mt-1 text-sm text-teal-50">{description}</p></Link>; }
