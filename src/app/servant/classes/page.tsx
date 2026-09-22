"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Dynamic classes (الفصول) — phase admins create and manage any number of classes per
 * stage, and students/servants are filtered by stage and class across the app.
 */
type ClassRow = {
  id: string;
  name: string;
  phaseId: string;
  phaseName: string;
  phaseAbbreviation: string;
  memberCount: number;
};

type PhaseOption = { id: string; name: string; abbreviation: string };

export default function ClassesPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<ClassRow[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [phaseFilter, setPhaseFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const canCreate = can("createClasses");
  const canManage = can("manageClasses");

  useEffect(() => {
    if (loading) return;
    if (!user || !canManage) router.replace("/servant");
  }, [user, loading, router, canManage]);

  async function load(nextPhase = phaseFilter) {
    const params = new URLSearchParams();
    if (nextPhase) params.set("phaseId", nextPhase);
    const [classesRes, phasesRes] = await Promise.all([
      fetch(`/api/classes?${params.toString()}`),
      fetch("/api/phases"),
    ]);
    if (!classesRes.ok) {
      toast.error("تعذر تحميل الفصول");
      return;
    }
    const data = await classesRes.json();
    setRows(data.classes);
    if (phasesRes.ok) {
      const phaseData = await phasesRes.json();
      setPhases(phaseData.phases);
    }
  }

  useEffect(() => {
    if (loading || !user || !canManage) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canManage]);

  async function createClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: String(fd.get("phaseId") || ""), name: String(fd.get("name") || "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء الفصل");
      toast.success("تم إنشاء الفصل");
      e.currentTarget.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function rename(item: ClassRow) {
    const name = window.prompt("اسم الفصل الجديد", item.name);
    if (!name || name.trim() === item.name) return;
    const res = await fetch("/api/classes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, phaseId: item.phaseId, name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "تعذر التعديل");
      return;
    }
    toast.success("تم تحديث الفصل");
    await load();
  }

  async function remove(item: ClassRow) {
    if (!window.confirm(`حذف الفصل «${item.name}» من مرحلة ${item.phaseName}؟`)) return;
    const res = await fetch(`/api/classes?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "تعذر الحذف");
      return;
    }
    toast.success("تم حذف الفصل");
    await load();
  }

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-1 text-2xl font-black text-[var(--color-navy)]">الفصول</h1>
        <p className="mb-5 text-sm text-slate-600">
          أنشئ أي عدد من الفصول داخل كل مرحلة، ويتم تصنيف المخدومين والخدام حسب المرحلة والفصل في كل الشاشات والتقارير.
        </p>

        {canCreate && (
          <form onSubmit={createClass} className="glass mb-5 grid gap-3 rounded-3xl p-4 sm:grid-cols-[1fr_1fr_auto]">
            <Select name="phaseId" label="المرحلة" required defaultValue="">
              <option value="" disabled>
                اختر المرحلة
              </option>
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name} ({phase.abbreviation})
                </option>
              ))}
            </Select>
            <Input name="name" label="اسم الفصل / الصف" placeholder="مثال: فصل أ" required />
            <div className="flex items-end">
              <Button type="submit" disabled={busy} className="w-full">
                <Plus className="h-4 w-4" /> إنشاء فصل
              </Button>
            </div>
          </form>
        )}

        <div className="glass mb-5 rounded-3xl p-4">
          <Select label="تصفية بالمرحلة" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
            <option value="">كل المراحل</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </Select>
          <div className="mt-3 flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              تحديث
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((item) => (
            <div key={item.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div>
                <p className="font-black text-[var(--color-navy)]">
                  <LayoutGrid className="ml-1 inline h-4 w-4" /> {item.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.phaseName} ({item.phaseAbbreviation}) · {item.memberCount} عضو
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => void rename(item)}>
                  تعديل الاسم
                </Button>
                <Button size="sm" variant="danger" onClick={() => void remove(item)}>
                  <Trash2 className="h-3.5 w-3.5" /> حذف
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="glass rounded-2xl p-6 text-center text-slate-500">لا توجد فصول بعد</p>}
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

