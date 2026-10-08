"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileDown,
  FileUp,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { UserForm, type ClassChoice, type ManageableUser, type PhaseChoice } from "@/components/admin/user-form";
import { StudentPointsPanel } from "@/components/admin/student-points-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { GRADES } from "@/lib/utils";
import { cachedFetch, invalidateCache, primeCache } from "@/lib/cache";

type UserRow = ManageableUser & {
  id: string;
  qrCodeId?: string;
  phaseName?: string | null;
  phaseAbbreviation?: string | null;
  className?: string | null;
  role: string;
};

type IssuedCredentials = { fullName: string; username: string; password: string };

type ImportedCredentials = {
  fullName: string;
  username: string;
  password: string;
  phaseName: string;
  className: string | null;
};

type UsersResponse = {
  users: UserRow[];
  phases: PhaseChoice[];
  classes: ClassChoice[];
};

const USERS_CACHE_TTL = 15_000;

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
  const [listLoading, setListLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [pointsUser, setPointsUser] = useState<UserRow | null>(null);

  const canCreate = can("createStudents");
  const canManage = can("manageStudents");
  // Excel import is exclusive to Sector/Church Admins (CHURCH_ADMIN/SUPER_ADMIN).
  const isChurchAdmin =
    user?.role === "CHURCH_ADMIN" || user?.role === "SUPER_ADMIN";

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: ImportedCredentials[];
    skipped: { row: number; reason: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.role === "STUDENT") {
      router.replace(user?.role === "STUDENT" ? "/" : "/admin121210");
      return;
    }
    if (!canManage) router.replace("/servant");
  }, [user, loading, router, canManage]);

  function buildQuery() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (grade) params.set("grade", grade);
    if (phaseId) params.set("phaseId", phaseId);
    if (classId) params.set("classId", classId);
    return `/api/users?${params.toString()}`;
  }

  function applyUsersResponse(data: UsersResponse) {
    setUsers((data.users as UserRow[]).filter((row) => row.role === "STUDENT"));
    setPhases(data.phases);
    setClasses(data.classes);
  }

  async function fetchUsers(url: string): Promise<UsersResponse> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("تعذر تحميل المخدومين");
    return (await res.json()) as UsersResponse;
  }

  // SWR-style: instant stale render, then background revalidation.
  async function load() {
    const url = buildQuery();
    try {
      const hit = await cachedFetch<UsersResponse>(url, () => fetchUsers(url), USERS_CACHE_TTL);
      applyUsersResponse(hit.data);
      setListLoading(false);
      if (hit.cached) {
        void fetchUsers(url)
          .then((fresh) => {
            primeCache(url, fresh);
            applyUsersResponse(fresh);
          })
          .catch(() => undefined);
      }
    } catch {
      setListLoading(false);
      toast.error("تعذر تحميل المخدومين");
    }
  }

  useEffect(() => {
    if (loading || !user || !canManage) return;
    setListLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canManage]);

  // Debounced search: reflect typing instantly, hit the API after a pause.
  useEffect(() => {
    if (loading || !user || !canManage) return;
    const id = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, grade, phaseId, classId]);

  const stats = useMemo(() => {
    const totalPoints = users.reduce((a, s) => a + (s.totalPoints || 0), 0);
    return { total: users.length, totalPoints };
  }, [users]);

  const classOptions = phaseId ? classes.filter((item) => item.phaseId === phaseId) : classes;

  async function saveUser(payload: Record<string, unknown>) {
    setBusy(true);
    // Optimistic update: reflect edits instantly, roll back on failure.
    const snapshot = users;
    const optimisticRow = {
      id: editing?.id ?? `temp-${Date.now()}`,
      role: "STUDENT",
      fullName: String(payload.fullName || editing?.fullName || ""),
      phone: String(payload.phone || editing?.phone || ""),
      ...payload,
    } as UserRow;
    if (editing) {
      setUsers((prev) => prev.map((row) => (row.id === editing.id ? { ...row, ...optimisticRow } : row)));
    }
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
      invalidateCache("/api/users");
      await load();
    } catch (err) {
      setUsers(snapshot);
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const snapshot = users;
    setUsers((prev) => prev.filter((row) => row.id !== deleteTarget.id));
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر الحذف");
      toast.success("تم حذف المخدوم");
      setDeleteTarget(null);
      invalidateCache("/api/users");
      await load();
    } catch (err) {
      setUsers(snapshot);
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

  /** Downloads an empty Excel template with the exact expected columns. */
  async function downloadImportTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = [
      "الاسم الرباعي",
      "رقم التليفون",
      "رقم تليفون إضافي / ولي الأمر",
      "العنوان",
      "المرحلة",
      "الفصل",
      "تاريخ الميلاد",
      "وظيفة الأب",
      "وظيفة الأم",
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ["مينا جورج فوزي حنا", "01555555551", "01255555551", "شبرا — شارع الترعة", "1 إعدادي", "فصل أ", "2012-05-10", "مهندس", "مدرسة"],
    ]);
    ws["!cols"] = headers.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, ws, "الطلاب");
    XLSX.writeFile(wb, "قالب-استيراد-الطلاب.xlsx");
  }

  function cellToString(value: unknown): string {
    if (value == null) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number") {
      // Excel may store phone numbers / dates as numbers.
      if (Number.isInteger(value)) return String(value);
      const asDate = XLSXSerialToDate(value);
      if (asDate) return asDate;
      return String(value);
    }
    return String(value).trim();
  }

  function XLSXSerialToDate(serial: number): string | null {
    // Excel serial dates are days since 1899-12-30; phone numbers are far larger.
    if (serial < 20000 || serial > 60000) return null;
    const base = Date.UTC(1899, 11, 30);
    const d = new Date(base + serial * 86400000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("ملف Excel فارغ");
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
      if (aoa.length < 2) throw new Error("لا توجد صفوف في الملف");

      const norm = (v: unknown) =>
        String(v ?? "")
          .trim()
          .replace(/\s+/g, " ");
      const headers = (aoa[0] as unknown[]).map(norm);
      const col = (...names: string[]) => {
        for (const n of names) {
          const i = headers.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };
      // Positional fallback keeps spreadsheets usable even with renamed headers.
      const cName = col("الاسم الرباعي", "الاسم", "name");
      const cPhone = col("رقم التليفون", "التليفون", "الموبايل", "الهاتف", "phone");
      const cParent = col("رقم تليفون إضافي / ولي الأمر", "رقم ولي الأمر", "ولي الأمر", "تليفون إضافي");
      const cAddress = col("العنوان", "address");
      const cStage = col("المرحلة", "الصف", "stage", "phase");
      const cClass = col("الفصل", "class");
      const cBirth = col("تاريخ الميلاد", "الميلاد", "birth");
      const cFatherJob = col("وظيفة الأب", "مهنة الأب");
      const cMotherJob = col("وظيفة الأم", "مهنة الأم");

      const at = (row: unknown[], i: number, fallback: number) =>
        cellToString(i >= 0 ? row[i] : row[fallback]);

      const rows = (aoa.slice(1) as unknown[][])
        .map((row) => ({
          fullName: at(row, cName, 0),
          phone: at(row, cPhone, 1),
          secondaryPhone: at(row, cParent, 2),
          address: at(row, cAddress, 3),
          stage: at(row, cStage, 4),
          className: at(row, cClass, 5),
          birthDate: at(row, cBirth, 6),
          fatherJob: at(row, cFatherJob, 7),
          motherJob: at(row, cMotherJob, 8),
        }))
        .filter((r) => r.fullName || r.phone);

      if (rows.length === 0) throw new Error("لا توجد صفوف صالحة في الملف");

      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاستيراد");

      setImportResult({ created: data.created ?? [], skipped: data.skipped ?? [] });
      toast.success(`تم استيراد ${data.summary?.created ?? 0} طالب بنجاح`);
      invalidateCache("/api/users");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاستيراد");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Exports the freshly generated usernames + PINs for easy distribution. */
  async function downloadImportedCredentials() {
    if (!importResult || importResult.created.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      importResult.created.map((c) => ({
        "الاسم الرباعي": c.fullName,
        "اسم المستخدم": c.username,
        "الرقم السري": c.password,
        المرحلة: c.phaseName,
        الفصل: c.className ?? "",
      }))
    );
    ws["!cols"] = [{ wch: 30 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "بيانات الدخول");
    XLSX.writeFile(wb, "بيانات-دخول-الطلاب.xlsx");
  }
return (
    <>
      <PageShell withStaffNav>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-[var(--color-navy)] sm:text-2xl">إدارة المخدومين</h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {listLoading ? "جارٍ التحميل..." : `${stats.total} مخدوم · ${stats.totalPoints} طايو — مصنّفون حسب المرحلة والفصل داخل نطاق خدمتك.`}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <Button type="button" variant="gold" onClick={() => void exportReport()} disabled={exporting} className="w-full sm:w-auto">
              <Download className="h-4 w-4" /> {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
            </Button>
            {isChurchAdmin && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="w-full sm:w-auto"
                >
                  <FileUp className="h-4 w-4" /> {importing ? "جارٍ الاستيراد..." : "استيراد من Excel"}
                </Button>
              </>
            )}
            {canCreate && (
              <Button
                type="button"
                className="w-full sm:w-auto"
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

        <div className="glass mb-5 grid grid-cols-1 gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <Input label="بحث بالاسم أو التليفون أو اسم المستخدم" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب للبحث الفوري..." />
          </div>
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
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="button" variant="secondary" onClick={() => void load()} className="w-full sm:w-auto">
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
        open={!!importResult}
        onClose={() => setImportResult(null)}
        title="نتيجة استيراد Excel"
        className="sm:max-w-2xl"
      >
        {importResult && (
          <div className="space-y-4">
            <p className="text-sm font-bold text-slate-700">
              تم إنشاء {importResult.created.length} حساب — وزّع أسماء المستخدمين والأرقام السرية على
              المخدومين.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="gold"
                disabled={importResult.created.length === 0}
                onClick={() => void downloadImportedCredentials()}
              >
                <FileDown className="h-4 w-4" /> تنزيل بيانات الدخول (Excel)
              </Button>
              <Button type="button" variant="secondary" onClick={() => void downloadImportTemplate()}>
                <FileDown className="h-4 w-4" /> تنزيل القالب
              </Button>
            </div>
            {importResult.created.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="p-2">الاسم</th>
                      <th className="p-2">اسم المستخدم</th>
                      <th className="p-2">الرقم السري</th>
                      <th className="p-2">المرحلة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.created.map((c) => (
                      <tr key={c.username} className="border-t border-slate-100">
                        <td className="p-2 font-bold">{c.fullName}</td>
                        <td className="p-2 font-mono" dir="ltr">
                          {c.username}
                        </td>
                        <td className="p-2 font-mono font-black" dir="ltr">
                          {c.password}
                        </td>
                        <td className="p-2">{c.phaseName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {importResult.skipped.length > 0 && (
              <div className="rounded-2xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">
                <p className="mb-1 font-black">صفوف متخطاة ({importResult.skipped.length}):</p>
                <ul className="max-h-32 list-disc space-y-1 overflow-auto pr-4">
                  {importResult.skipped.map((s, i) => (
                    <li key={i}>
                      صف {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button type="button" className="w-full" onClick={() => setImportResult(null)}>
              تم — إغلاق
            </Button>
          </div>
        )}
      </Modal>

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

