"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ScanLine, Users, Trophy, Church } from "lucide-react";
import { PageShell, StaffBottomNav, BrandMark } from "@/components/layout/shell";
import { useAuth } from "@/components/providers/auth-provider";

type Stats = {
  totalStudents: number;
  totalPointsIssued: number;
  massAttendances: number;
  totalTransactions: number;
};

type Recent = {
  id: string;
  pointsAmount: number;
  studentName: string;
  eventTitle: string;
  note: string | null;
};

export default function ServantHomePage() {
  const { user, church, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role === "STUDENT") {
      router.replace("/student/dashboard");
      return;
    }
    if (user.role === "SUPER_ADMIN") {
      router.replace("/super-admin/tenants");
      return;
    }
    void (async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
      setRecent(data.recent);
    })();
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <PageShell>
        <div className="py-20 text-center text-slate-500">جارٍ التحميل...</div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell withStaffNav>
        <div className="mb-6 flex items-center justify-between">
          <BrandMark size="sm" />
          <div className="text-left">
            <p className="text-xs text-slate-500">{church?.name}</p>
            <p className="text-sm font-bold text-[var(--color-navy)]">{user.fullName}</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link href="/servant/quick-scan?kind=mass" className="rounded-[2rem] bg-[var(--color-emerald)] px-5 py-5 text-white shadow-xl shadow-teal-900/20">
          <div>
            <p className="text-xl font-black">مسح QR وإضافة نقط</p>
            <p className="mt-1 text-sm text-teal-50">افتح الكاميرا أو ابحث بالاسم</p>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
            <ScanLine className="h-7 w-7" />
          </div>
        </Link>
        <Link href="/servant/quick-scan?kind=service" className="rounded-[2rem] bg-[var(--color-navy)] px-5 py-5 text-white shadow-xl shadow-slate-900/20"><p className="text-lg font-black">مسح سريع: الخدمة</p><p className="mt-1 text-sm text-slate-200">حضور ونقاط تلقائية</p></Link>
        <Link href="/servant/scan" className="rounded-[2rem] bg-[var(--color-gold)] px-5 py-5 text-[var(--color-navy)] shadow-xl"><p className="text-lg font-black">مسح مخصص / هدايا</p><p className="mt-1 text-sm">نقاط ومناسبة مخصصة</p></Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="المخدومين" value={stats?.totalStudents ?? "—"} />
          <StatCard icon={Church} label="حضور القداس" value={stats?.massAttendances ?? "—"} />
          <StatCard icon={Trophy} label="إجمالي النقط" value={stats?.totalPointsIssued ?? "—"} gold />
          <StatCard icon={ScanLine} label="المعاملات" value={stats?.totalTransactions ?? "—"} />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-black text-[var(--color-navy)]">آخر العمليات</h2>
          <div className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="glass flex items-center justify-between rounded-2xl px-4 py-3">
                <div>
                  <p className="font-bold">{r.studentName}</p>
                  <p className="text-xs text-slate-500">
                    {r.eventTitle}
                    {r.note ? ` — ${r.note}` : ""}
                  </p>
                </div>
                <span
                  className={`font-black ${r.pointsAmount >= 0 ? "text-teal-700" : "text-rose-700"}`}
                >
                  {r.pointsAmount >= 0 ? "+" : ""}
                  {r.pointsAmount}
                </span>
              </div>
            ))}
            {recent.length === 0 && (
              <p className="rounded-2xl bg-white/70 p-4 text-center text-sm text-slate-500">
                لا توجد عمليات بعد
              </p>
            )}
          </div>
        </section>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  gold,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  gold?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-4"
    >
      <Icon className={`mb-2 h-5 w-5 ${gold ? "text-[var(--color-gold)]" : "text-[var(--color-navy)]"}`} />
      <p className="text-2xl font-black text-[var(--color-ink)]">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </motion.div>
  );
}
