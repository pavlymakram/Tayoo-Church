"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, Pencil, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { UserForm, type ManageableUser } from "@/components/admin/user-form";
import { StudentPointsPanel } from "@/components/admin/student-points-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { GRADES } from "@/lib/utils";

type UserRow = ManageableUser & {
  id: string;
  qrCodeId?: string;
};

function roleLabel(role: string) {
  if (role === "STUDENT") return "مخدوم";
  if (role === "SERVANT") return "خادم";
  if (role === "CHURCH_ADMIN") return "أدمن";
  return role;
}

export default function UsersManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "CHURCH_ADMIN";
  const canManage = user?.role === "SERVANT" || user?.role === "CHURCH_ADMIN";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<UserRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [pointsUser, setPointsUser] = useState<UserRow | null>(null);

  async function load(nextQ = q, nextGrade = grade, nextRole = roleFilter) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextGrade) params.set("grade", nextGrade);
    if (nextRole && nextRole !== "ALL") params.set("role", nextRole);
    const res = await fetch(`/api/users?${params.toString()}`);
    if (!res.ok) {
      toast.error("تعذر تحميل المستخدمين");
      return;
    }
    const data = await res.json();
    setUsers(data.users);
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

  const stats = useMemo(() => {
    const students = users.filter((u) => u.role === "STUDENT");
    const totalPoints = students.reduce((a, s) => a + (s.totalPoints || 0), 0);
    return {
      total: users.length,
      students: students.length,
      staff: users.length - students.length,
      totalPoints,
    };
  }, [users]);

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

  async function saveUser(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: formMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      toast.success(formMode === "create" ? "تمت الإضافة" : "تم حفظ التعديلات");
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      toast.success("تم حذف المستخدم");
      setDeleteTarget(null);
      if (pointsUser?.id === deleteTarget.id) setPointsUser(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  function canEditRow(row: UserRow) {
    if (!canManage) return false;
    if (row.role === "STUDENT") return true;
    return isAdmin;
  }

  function canDeleteRow(row: UserRow) {
    if (!canManage) return false;
    if (row.id === user?.id) return false;
    if (row.role === "STUDENT") return true;
    return isAdmin;
  }

  return (
    <>
      <PageShell withStaffNav>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[var(--color-navy)]">إدارة المستخدمين</h1>
            <p className="text-sm text-slate-500">مخدومين وخدام — بحث، تعديل، حذف، وإدارة النقط</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setFormMode("create");
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة مخدوم/خادم جديد
            </Button>
            <Button onClick={() => void exportExcel()} disabled={exporting} variant="gold">
              <Download className="h-4 w-4" />
              {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
            </Button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_140px_140px_auto]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الموبايل"
          />
          <Select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              void load(q, grade, e.target.value);
            }}
          >
            <option value="ALL">الكل</option>
            <option value="STUDENT">مخدومين</option>
            <option value="STAFF">خدام</option>
          </Select>
          <Select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              void load(q, e.target.value, roleFilter);
            }}
          >
            <option value="">كل المراحل</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            <Search className="h-4 w-4" />
            بحث
          </Button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="الإجمالي" value={stats.total} />
          <Summary label="مخدومين" value={stats.students} />
          <Summary label="خدام" value={stats.staff} />
          <Summary label="إجمالي النقط" value={stats.totalPoints} gold />
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-navy)] text-white">
              <tr>
                <th className="px-4 py-3 text-right font-bold">الاسم</th>
                <th className="px-4 py-3 text-right font-bold">الدور</th>
                <th className="px-4 py-3 text-right font-bold">المرحلة</th>
                <th className="px-4 py-3 text-right font-bold">موبايل</th>
                <th className="px-4 py-3 text-right font-bold">النقط</th>
                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row, i) => (
                <tr key={row.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                  <td className="px-4 py-3 font-bold">{row.fullName}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">
                      {roleLabel(row.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.grade || "—"}</td>
                  <td className="px-4 py-3 dir-ltr text-right">{row.phone}</td>
                  <td className="px-4 py-3 font-black text-[var(--color-gold)]">
                    {row.role === "STUDENT" ? row.totalPoints ?? 0 : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {canEditRow(row) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setFormMode("edit");
                            setEditing(row);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          تعديل البيانات
                        </Button>
                      )}
                      {row.role === "STUDENT" && canManage && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setPointsUser(row)}
                        >
                          <History className="h-3.5 w-3.5" />
                          النقط
                        </Button>
                      )}
                      {canDeleteRow(row) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          حذف
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="p-8 text-center text-slate-500">لا يوجد مستخدمين</p>
          )}
        </div>
      </PageShell>
      <StaffBottomNav />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={formMode === "create" ? "إضافة مخدوم/خادم جديد" : "تعديل البيانات"}
        className="sm:max-w-xl"
      >
        <UserForm
          key={editing?.id || "new"}
          mode={formMode}
          initial={editing}
          canManageStaff={!!isAdmin}
          submitting={busy}
          onSubmit={saveUser}
        />
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              هل أنت متأكد من حذف{" "}
              <strong>{deleteTarget.fullName}</strong> نهائياً؟
              {deleteTarget.role === "STUDENT"
                ? " سيتم حذف سجلاته وحركات النقط المرتبطة به."
                : " سيتم إعادة إسناد الحركات التي أصدرها إليك ثم حذف الحساب."}
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
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
              >
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
            canManage={!!canManage}
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
      <p
        className={`text-2xl font-black ${
          gold ? "text-[var(--color-gold)]" : "text-[var(--color-navy)]"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
