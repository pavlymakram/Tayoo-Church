"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarCheck2,
  ClipboardList,
  Church,
  Gift,
  LayoutGrid,
  ScanLine,
  Settings2,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import { PageShell, StaffBottomNav, BrandMark } from "@/components/layout/shell";
import { useAuth } from "@/components/providers/auth-provider";
import { roleLabel } from "@/lib/utils";
import { sectorLabel } from "@/lib/phases";
import { fetchJsonWithCache } from "@/lib/offline-db";

type Stats = {
  totalStudents: number;
  totalPointsIssued: number;
  massAttendances: number;
  serviceAttendances: number;
  totalTransactions: number;
  classCount: number;
};

type Recent = {
  id: string;
  pointsAmount: number;
  studentName: string;
  eventTitle: string;
  note: string | null;
};

export default function ServantHomePage() {
  const { user, church, loading, can, role } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/admin121210");
      return;
    }
    if (role === "STUDENT") {
      router.replace("/student/dashboard");
      return;
    }
    if (role === "SUPER_ADMIN") {
      router.replace("/super-admin/tenants");
      return;
    }
    void (async () => {
      try {
        // Network-First with IndexedDB fallback — the dashboard opens offline.
        const { data } = await fetchJsonWithCache<{
          stats: Stats;
          recent: Recent[];
        }>("/api/dashboard/stats");
        setStats(data.stats ?? null);
        setRecent(data.recent ?? []);
      } catch {
        /* offline with no saved copy yet */
      }
    })();
  }, [user, loading, router, role]);

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
            <p className="text-[11px] text-slate-500">
              {roleLabel(role)}
              {user.sector ? ` · قطاع ${sectorLabel(user.sector)}` : ""}
              {user.phaseName ? ` · ${user.phaseName}` : ""}
            </p>
          </div>
        </div>

        {can("scanQr") && (
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Link
              href="/servant/quick-scan?kind=mass"
              className="rounded-[2rem] bg-[var(--color-emerald)] px-5 py-5 text-white shadow-xl shadow-teal-900/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-black">مسح القداس</p>
                  <p className="mt-1 text-sm text-teal-50">القداس الإلهي — حضور ونقاط القداس</p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
                  <Church className="h-7 w-7" />
                </div>
              </div>
            </Link>
            <Link
              href="/servant/quick-scan?kind=service"
              className="rounded-[2rem] bg-[var(--color-navy)] px-5 py-5 text-white shadow-xl shadow-slate-900/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-black">مسح الحضور</p>
                  <p className="mt-1 text-sm text-slate-200">الخدمة / مدارس الأحد — حضور ونقاط تلقائية</p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
                  <ScanLine className="h-7 w-7" />
                </div>
              </div>
            </Link>
            <Link
              href="/servant/scan"
              className="rounded-[2rem] bg-[var(--color-gold)] px-5 py-5 text-[var(--color-navy)] shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black">مسح مخصص / هدايا</p>
                  <p className="mt-1 text-sm">نقاط ومناسبة مخصصة</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/40">
                  <Gift className="h-6 w-6" />
                </div>
              </div>
            </Link>
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {can("createStudents") && (
            <ManagementCard
              href="/servant/students"
              icon={Users}
              title="إدارة المخدومين"
              description="إضافة المخدومين وتوزيعهم على المراحل والفصول"
            />
          )}
          {can("managePhaseServants") && (
            <ManagementCard
              href="/servant/staff"
              icon={UserCog}
              title="إدارة الخدام"
              description="جدول موحّد: الأدوار والمراحل والفصول وبيانات الدخول المولّدة"
            />
          )}
          {(can("createClasses") || can("manageClasses")) && (
            <ManagementCard
              href="/servant/classes"
              icon={LayoutGrid}
              title="الفصول"
              description="إنشاء وإدارة أي عدد من الفصول داخل كل مرحلة"
            />
          )}
          {can("viewAttendanceLogs") && (
            <ManagementCard
              href="/servant/attendance"
              icon={ClipboardList}
              title="سجل الحضور والتقارير"
              description="سجلات القداس والخدمة بتواريخ دقيقة وتصدير Excel"
            />
          )}
          {can("manageChurchSettings") && (
            <ManagementCard
              href="/servant/settings"
              icon={Settings2}
              title="إعدادات الكنيسة"
              description="النقاط الافتراضية وكود الكنيسة ومفتاح الترخيص"
            />
          )}
          {can("manageEvents") && (
            <ManagementCard
              href="/servant/events"
              icon={CalendarCheck2}
              title="المناسبات والنقاط"
              description="إدارة المناسبات والنقاط الافتراضية"
            />
          )}
        </div>

<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="المخدومين" value={stats?.totalStudents ?? "—"} />
          <StatCard icon={Church} label="حضور القداس" value={stats?.massAttendances ?? "—"} />
          <StatCard icon={ScanLine} label="حضور الخدمة" value={stats?.serviceAttendances ?? "—"} />
          <StatCard icon={Trophy} label="إجمالي النقط" value={stats?.totalPointsIssued ?? "—"} gold />
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
                <span className={`font-black ${r.pointsAmount >= 0 ? "text-teal-700" : "text-rose-700"}`}>
                  {r.pointsAmount >= 0 ? "+" : ""}
                  {r.pointsAmount}
                </span>
              </div>
            ))}
            {recent.length === 0 && (
              <p className="rounded-2xl bg-white/70 p-4 text-center text-sm text-slate-500">لا توجد عمليات بعد</p>
            )}
          </div>
        </section>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

function ManagementCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="glass flex items-start gap-3 rounded-3xl p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--color-navy)]/10 text-[var(--color-navy)]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-black text-[var(--color-navy)]">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </Link>
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
