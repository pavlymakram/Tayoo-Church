"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { GRADES } from "@/lib/utils";

type Student = {
  id: string;
  fullName: string;
  grade: string | null;
  phone: string;
  secondaryPhone: string | null;
  address: string | null;
  confessionFather: string | null;
  totalPoints: number;
};

export default function StudentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [exporting, setExporting] = useState(false);

  async function load(nextQ = q, nextGrade = grade) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextGrade) params.set("grade", nextGrade);
    const res = await fetch(`/api/students?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    setStudents(data.students);
  }

  useEffect(() => {
    if (loading) return;
    if (!user || user.role === "STUDENT") {
      router.replace("/auth/staff");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router]);

  async function exportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (grade) params.set("grade", grade);
      const res = await fetch(`/api/export/visitation?${params.toString()}`);
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "افتقاد.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير شيت الافتقاد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageShell withStaffNav>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-[var(--color-navy)]">الافتقاد والمخدومين</h1>
          <Button onClick={() => void exportExcel()} disabled={exporting} variant="gold">
            <Download className="h-4 w-4" />
            {exporting ? "جارٍ التصدير..." : "تصدير إلى Excel"}
          </Button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الموبايل"
          />
          <Select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              void load(q, e.target.value);
            }}
          >
            <option value="">كل المراحل</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void load()}
          >
            <Search className="h-4 w-4" />
            بحث
          </Button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Summary label="عدد المخدومين" value={students.length} />
          <Summary
            label="إجمالي النقط"
            value={students.reduce((a, s) => a + s.totalPoints, 0)}
            gold
          />
          <Summary
            label="متوسط النقط"
            value={
              students.length
                ? Math.round(
                    students.reduce((a, s) => a + s.totalPoints, 0) / students.length
                  )
                : 0
            }
          />
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-navy)] text-white">
              <tr>
                <th className="px-4 py-3 text-right font-bold">الاسم</th>
                <th className="px-4 py-3 text-right font-bold">المرحلة</th>
                <th className="px-4 py-3 text-right font-bold">موبايل</th>
                <th className="px-4 py-3 text-right font-bold">ولي الأمر</th>
                <th className="px-4 py-3 text-right font-bold">العنوان</th>
                <th className="px-4 py-3 text-right font-bold">النقط</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                  <td className="px-4 py-3 font-bold">{s.fullName}</td>
                  <td className="px-4 py-3">{s.grade}</td>
                  <td className="px-4 py-3 dir-ltr text-right">{s.phone}</td>
                  <td className="px-4 py-3 dir-ltr text-right">{s.secondaryPhone}</td>
                  <td className="px-4 py-3 max-w-56 truncate">{s.address}</td>
                  <td className="px-4 py-3 font-black text-[var(--color-gold)]">{s.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <p className="p-8 text-center text-slate-500">لا يوجد مخدومين</p>
          )}
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

function Summary({
  label,
  value,
  gold,
}: {
  label: string;
  value: number;
  gold?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className={`text-2xl font-black ${gold ? "text-[var(--color-gold)]" : "text-[var(--color-navy)]"}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
