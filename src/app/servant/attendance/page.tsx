"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Church, Download, Hourglass } from "lucide-react";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchJsonWithCache } from "@/lib/offline-db";

/**
 * Attendance & reports screen.
 *
 * Shows the Friday Liturgy (القداس) and Service (الخدمة) logs with exact DD/MM/YYYY
 * dates inside the caller's scope, and exports the role-scoped Excel workbook.
 */
type LogRow = {
  id: string;
  kind: "LITURGY" | "SERVICE";
  kindLabel: string;
  eventTitle: string;
  date: string;
  isFriday: boolean;
  pointsAmount: number;
  studentId: string;
  studentName: string;
  phaseName: string | null;
  className: string | null;
  servantName: string;
};

type PhaseOption = { id: string; name: string; abbreviation: string };
type ClassOption = { id: string; name: string; phaseId: string };

export default function AttendancePage() {
  const { user, loading, can, role } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<LogRow[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [summary, setSummary] = useState<{ liturgy: number; service: number; students: number; fridays: string[] } | null>(null);

  const [kind, setKind] = useState("ALL");
  const [phaseId, setPhaseId] = useState("");
  const [classId, setClassId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fridayOnly, setFridayOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canView = can("viewAttendanceLogs");

  useEffect(() => {
    if (loading) return;
    if (!user || !canView) router.replace("/servant");
  }, [user, loading, router, canView]);

  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (kind !== "ALL") params.set("kind", kind);
      if (phaseId) params.set("phaseId", phaseId);
      if (classId) params.set("classId", classId);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("fridayOnly", String(fridayOnly));
      // Network-First with IndexedDB fallback — the report opens offline too.
      const { data } = await fetchJsonWithCache<{
        rows: LogRow[];
        phases: PhaseOption[];
        classes: ClassOption[];
        summary: { liturgy: number; service: number; students: number; fridays: string[] };
      }>(`/api/attendance/log?${params.toString()}`);
      setRows(data.rows ?? []);
      setPhases(data.phases ?? []);
      setClasses(data.classes ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  // Refresh after the background sync flushes locally saved operations.
  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener("tayoo:offline-synced", onSynced);
    return () => window.removeEventListener("tayoo:offline-synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || !user || !canView) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canView]);

  const classOptions = useMemo(
    () => (phaseId ? classes.filter((item) => item.phaseId === phaseId) : classes),
    [classes, phaseId]
  );

  async function exportReport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export/report");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل التصدير" }));
        throw new Error(data.error || "فشل التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const scopeLabel = role === "CHURCH_ADMIN" ? "كل-الكنيسة" : "نطاق-خدمتي";
      a.download = `طايو-${scopeLabel}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير تقرير Excel");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-1 text-2xl font-black text-[var(--color-navy)]">سجل القداس والخدمة</h1>
        <p className="mb-5 text-sm text-slate-600">
          سجلات الحضور بأيام الجمعة وتواريخ دقيقة (يوم/شهر/سنة) لكل من القداس (القداس الإلهي) والخدمة، داخل نطاق خدمتك فقط.
        </p>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="glass rounded-2xl p-4">
            <Church className="mb-1 h-5 w-5 text-[var(--color-navy)]" />
            <p className="text-2xl font-black text-[var(--color-navy)]">{summary?.liturgy ?? "—"}</p>
            <p className="text-xs text-slate-500">حضور القداس</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <Hourglass className="mb-1 h-5 w-5 text-[var(--color-gold)]" />
            <p className="text-2xl font-black text-[var(--color-gold)]">{summary?.service ?? "—"}</p>
            <p className="text-xs text-slate-500">حضور الخدمة</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <CalendarCheck2 className="mb-1 h-5 w-5 text-[var(--color-emerald)]" />
            <p className="text-2xl font-black text-[var(--color-emerald)]">{summary?.students ?? "—"}</p>
            <p className="text-xs text-slate-500">عدد المخدومين</p>
          </div>
        </div>

        <div className="glass mb-5 grid gap-3 rounded-3xl p-4 sm:grid-cols-2">
          <Select label="نوع السجل" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="ALL">القداس + الخدمة</option>
            <option value="LITURGY">القداس فقط</option>
            <option value="SERVICE">الخدمة فقط</option>
          </Select>
          <Input label="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المخدوم" />
          <Select label="المرحلة" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">كل المراحل</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name} ({phase.abbreviation})
              </option>
            ))}
          </Select>
          <Select label="الفصل" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">كل الفصول</option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input label="من تاريخ" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="إلى تاريخ" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={fridayOnly}
              onChange={(e) => setFridayOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-emerald)]"
            />
            <span className="text-sm font-semibold">أيام الجمعة فقط (يوم الحضور الرسمي)</span>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" onClick={() => void load()} disabled={busy}>
              {busy ? "جارٍ التحميل..." : "تطبيق الفلاتر"}
            </Button>
            <Button type="button" variant="gold" onClick={() => void exportReport()} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "جارٍ التصدير..." : "تصدير تقرير Excel"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="glass rounded-2xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--color-ink)]">{row.studentName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.phaseName ? `${row.phaseName} · ` : ""}
                    {row.className ? `فصل ${row.className} · ` : ""}
                    {row.eventTitle} · بواسطة {row.servantName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      row.kind === "LITURGY" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.kindLabel}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.date}</span>
                  <span className="text-sm font-black text-[var(--color-gold)]">+{row.pointsAmount}</span>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && !busy && (
            <p className="glass rounded-2xl p-6 text-center text-slate-500">لا توجد سجلات حضور مطابقة</p>
          )}
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}
