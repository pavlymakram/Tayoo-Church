"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, History, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { UserForm, type ClassChoice, type ManageableUser, type PhaseChoice } from "@/components/admin/user-form";
import { StudentPointsPanel } from "@/components/admin/student-points-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { GRADES } from "@/lib/utils";

type UserRow = ManageableUser & {
  id: string;
  qrCodeId?: string;
  phaseName?: string | null;
  phaseAbbreviation?: string | null;
  className?: string | null;
  role: string;
};

type IssuedCredentials = { fullName: string; username: string; password: string };

export default function StudentsPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [phases, setPhases] = useState<PhaseChoice[]>([]);
  const [classes, setClasses] = useState<ClassChoice[]>([]);

  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [pointsUser, setPointsUser] = useState<UserRow | null>(null);

  const canCreate = can("createStudents");
  const canManage = can("manageStudents");

  useEffect(() => {
    if (loading) return;
    if (!user || (user.role === "STUDENT" as string)) {
      router.replace("/admin121210");
      return;
    }
    if (!canManage) router.replace("/servant");
  }, [user, loading, router, canManage]);

  async function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (grade) params.set("grade", grade);
    if (phaseId) params.set("phaseId", phaseId);
    if (classId) params.set("classId", classId);
    const res = await fetch(`/api/users?${params.toString()}`);
    if (!res.ok) {
      toast.error("تعذر تحميل المخدومين");
      return;
    }
    const data = await res.json();
    setUsers((data.users as UserRow[]).filter((row) => row.role === "STUDENT"));
    setPhases(data.phases);
    setClasses(data.classes);
  }

  useEffect(() => {
    if (loading || !user || !canManage) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canManage]);

  const stats = useMemo(() => {
    const totalPoints = users.reduce((a, s) => a + (s.totalPoints || 0), 0);
    return { total: users.length, totalPoints };
  }, [users]);

  const classOptions = phaseId ? classes.filter((item) => item.phaseId === phaseId) : classes;

  async function saveUser(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر الحفظ");
      if (data.username && data.initialPassword) {
        setIssued({
          fullName: String(payload.fullName || ""),
          username: String(data.username),
          password: String(data.initialPassword),
        });
      }
      toast.success(editing ? "تم تحديث بيانات المخدوم" : "تمت إضافة المخدوم");
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر الحذف");
      toast.success("تم حذف المخدوم");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export/report");
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "طايو-تقرير-الحضور.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير التقرير");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setExporting(false);
    }
  }
return (
    <>
      <PageShell withStaffNav>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[var(--color-navy)]">إدارة المخدومين</h1>
            <p className="text-sm text-slate-600">
              {stats.total} مخدوم · {stats.totalPoints} طايو — مصنّفون حسب المرحلة والفصل داخل نطاق خدمتك.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="gold" onClick={() => void exportReport()} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
            </Button>
            {canCreate && (
              <Button
                type="button"
                onClick={() => {
                  setFormMode("create");
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-4 w-4" /> مخدوم جديد
              </Button>
            )}
          </div>
        </div>

        <div className="glass mb-5 grid gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="بحث بالاسم أو التليفون أو اسم المستخدم" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <Select label="المرحلة الدراسية" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">الكل</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="button" variant="secondary" onClick={() => void load()}>
              <Search className="h-4 w-4" /> تطبيق الفلاتر
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {users.map((row) => (
            <div key={row.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-[var(--color-navy)]">
                    <Users className="ml-1 inline h-4 w-4" /> {row.fullName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.phaseName ? `${row.phaseName} · ` : ""}
                    {row.className ? `فصل ${row.className} · ` : ""}
                    {row.phone}
                    {row.secondaryPhone ? ` · ${row.secondaryPhone}` : ""}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">{row.username ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-[var(--color-gold)]">
                    {row.totalPoints ?? 0} طايو
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setPointsUser(row)}>
                    <History className="h-3.5 w-3.5" /> السجل
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setFormMode("edit");
                          setEditing(row);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> تعديل
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="glass rounded-2xl p-8 text-center text-slate-500">لا يوجد مخدومين</p>}
        </div>
      </PageShell>
      <StaffBottomNav />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={formMode === "create" ? "إضافة مخدوم جديد" : "تعديل بيانات المخدوم"}
        className="sm:max-w-xl"
      >
        <UserForm
          key={editing?.id || "new"}
          mode={formMode}
          initial={editing}
          submitting={busy}
          phases={phases}
          classes={classes}
          onSubmit={saveUser}
        />
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="بيانات الدخول المولّدة">
        {issued && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              تم إنشاء حساب <strong>{issued.fullName}</strong> — سلّم بيانات الدخول للمخدوم (يمكنه تغييرها من حسابه).
            </p>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs text-slate-500">اسم المستخدم</p>
              <p className="font-mono text-lg font-black text-[var(--color-navy)]">{issued.username}</p>
              <p className="mt-3 text-xs text-slate-500">كلمة المرور الأولية</p>
              <p className="font-mono text-lg font-black text-[var(--color-gold)]">{issued.password}</p>
            </div>
            <Button type="button" className="w-full" onClick={() => setIssued(null)}>
              تم — إغلاق
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              هل أنت متأكد من حذف <strong>{deleteTarget.fullName}</strong> نهائياً؟ سيتم حذف سجلاته وحركات النقط المرتبطة به.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                className="flex-1"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                نعم، حذف نهائياً
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!pointsUser}
        onClose={() => setPointsUser(null)}
        title={pointsUser ? `نقط ${pointsUser.fullName}` : ""}
        className="sm:max-w-xl"
      >
        {pointsUser && (
          <StudentPointsPanel
            studentId={pointsUser.id}
            studentName={pointsUser.fullName}
            canManage={canManage}
            onBalanceChange={(total) => {
              setUsers((prev) =>
                prev.map((u) => (u.id === pointsUser.id ? { ...u, totalPoints: total } : u))
              );
            }}
          />
        )}
      </Modal>
    </>
  );
}

