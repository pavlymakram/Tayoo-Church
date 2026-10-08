"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2, UserPlus2 } from "lucide-react";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/providers/auth-provider";
import { SECTORS, sectorLabel } from "@/lib/phases";
import { ROLE_LABELS, roleLabel } from "@/lib/utils";
import { fetchJsonWithCache } from "@/lib/offline-db";
import { apiMutate } from "@/lib/offline-mutations";

/**
 * Unified Servant Management table.
 *
 * Merges the former "servant addition" form and "access code management" screen into
 * one table holding: full personal data, role, sector/stage assignment, dynamic class
 * assignment, the auto-generated username and the initially issued password.
 */
type StaffRow = {
  id: string;
  role: "CHURCH_ADMIN" | "PHASE_ADMIN" | "PHASE_SERVANT";
  fullName: string;
  username: string | null;
  initialPassword: string | null;
  phone: string;
  email?: string | null;
  secondaryPhone?: string | null;
  address?: string | null;
  sector: string | null;
  phaseId: string | null;
  phaseName: string | null;
  classId: string | null;
  className: string | null;
  isFirstAdmin: boolean;
  createdAt: string;
};

type PhaseOption = { id: string; name: string; abbreviation: string; sector: string };
type ClassOption = { id: string; name: string; phaseId: string };

type Me = {
  isFirstAdmin: boolean;
  canManageChurchAdmins: boolean;
  canManagePhaseAdmins: boolean;
  canManagePhaseServants: boolean;
};

type IssuedCredentials = { fullName: string; username: string; password: string };
type RoleOption = { value: string; label: string };

export default function StaffManagementPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);

  const canManage = can("managePhaseServants");

  useEffect(() => {
    if (loading) return;
    if (!user || !canManage) router.replace("/servant");
  }, [user, loading, router, canManage]);

  async function load(nextQ = q, nextRole = roleFilter, nextPhase = phaseFilter) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextRole && nextRole !== "ALL") params.set("role", nextRole);
    if (nextPhase) params.set("phaseId", nextPhase);
    try {
      // Network-First with IndexedDB fallback — the table opens offline too.
      const { data } = await fetchJsonWithCache<{
        staff: StaffRow[];
        phases: PhaseOption[];
        classes: ClassOption[];
        me: Me;
      }>(`/api/staff?${params.toString()}`);
      setRows(data.staff ?? []);
      setPhases(data.phases ?? []);
      setClasses(data.classes ?? []);
      setMe(data.me ?? null);
    } catch {
      toast.error("تعذر تحميل الخدام — لا يوجد اتصال ولا نسخة محفوظة");
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
    if (loading || !user || !canManage) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canManage]);

  const allRoleOptions = [
    { value: "PHASE_SERVANT", label: ROLE_LABELS.PHASE_SERVANT as string, allowed: !!me?.canManagePhaseServants },
    { value: "PHASE_ADMIN", label: ROLE_LABELS.PHASE_ADMIN as string, allowed: !!me?.canManagePhaseAdmins },
    { value: "CHURCH_ADMIN", label: ROLE_LABELS.CHURCH_ADMIN as string, allowed: !!me?.canManageChurchAdmins },
  ];
  const roleOptions: RoleOption[] = allRoleOptions
    .filter((option) => option.allowed)
    .map((option) => ({ value: option.value, label: option.label }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const role = String(fd.get("role") || "PHASE_SERVANT");
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      role,
      fullName: String(fd.get("fullName") || ""),
      phone: String(fd.get("phone") || ""),
      email: String(fd.get("email") || "") || null,
      secondaryPhone: String(fd.get("secondaryPhone") || "") || null,
      address: String(fd.get("address") || "") || null,
      sector: role === "PHASE_ADMIN" ? String(fd.get("sector") || "") || null : null,
      phaseId: role === "PHASE_SERVANT" ? String(fd.get("phaseId") || "") || null : null,
      classId: String(fd.get("classId") || "") || null,
      regenerateCredentials: fd.get("regenerateCredentials") === "on",
    };
    try {
      const out = await apiMutate<{
        initialPassword?: string | null;
        username?: string | null;
        staff?: { username?: string | null };
      }>("/api/staff", editing ? "PATCH" : "POST", payload);
      if (out.queued) {
        // Offline: saved locally; credentials are generated during sync.
        toast.info(
          editing
            ? "تم حفظ التعديلات محلياً — ستتم المزامنة عند عودة الاتصال"
            : "تم حفظ الخادم محلياً — ستتم المزامنة وتوليد بيانات الدخول عند عودة الاتصال"
        );
      } else {
        const data = out.data;
        if (data?.initialPassword) {
          setIssued({
            fullName: payload.fullName,
            username: String(data.username ?? data.staff?.username ?? ""),
            password: String(data.initialPassword),
          });
        }
        toast.success(editing ? "تم تحديث بيانات الخادم" : "تمت إضافة الخادم وتوليد بيانات الدخول");
      }
      setFormOpen(false);
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
      const out = await apiMutate(
        `/api/staff?id=${encodeURIComponent(deleteTarget.id)}`,
        "DELETE"
      );
      if (out.queued) toast.info("تم حذف الخادم محلياً — ستتم المزامنة عند عودة الاتصال");
      else toast.success("تم حذف الخادم");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  
  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-1 text-2xl font-black text-[var(--color-navy)]">إدارة الخدام</h1>
        <p className="mb-5 text-sm text-slate-600">
          جدول موحّد للبيانات الكاملة والدور والمرحلة أو القطاع والفصل واسم المستخدم وكلمة المرور المولّدة تلقائياً.
        </p>

        <div className="glass mb-5 grid gap-3 rounded-3xl p-4 sm:grid-cols-2">
          <Input
            label="بحث بالاسم أو اسم المستخدم أو التليفون"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث..."
          />
          <Select label="الدور" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">كل الأدوار</option>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="المرحلة" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
            <option value="">كل المراحل</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name} ({phase.abbreviation})
              </option>
            ))}
          </Select>
          <div className="flex items-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void load()}>
              <Search className="h-4 w-4" /> تصفية
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> خادم جديد
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-[var(--color-navy)]">
                    {row.fullName}
                    {row.isFirstAdmin && (
                      <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        الأدمن الأساسي
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {row.username ?? "—"} · {row.initialPassword ?? "كلمة المرور تغيّرت بواسطة الخادم"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {roleLabel(row.role)}
                    {row.role === "PHASE_ADMIN" && row.sector ? ` · قطاع ${sectorLabel(row.sector)}` : ""}
                    {row.phaseName ? ` · ${row.phaseName}` : ""}
                    {row.className ? ` · فصل ${row.className}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.phone}
                    {row.secondaryPhone ? ` · ${row.secondaryPhone}` : ""}
                    {row.email ? ` · ${row.email}` : ""}
                  </p>
                  {row.address && <p className="mt-1 text-xs text-slate-400">{row.address}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="glass rounded-2xl p-6 text-center text-slate-500">لا يوجد خدام بعد</p>
          )}
        </div>
      </PageShell>
      <StaffBottomNav />
<Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل بيانات الخادم" : "إضافة خادم جديد"}
        className="sm:max-w-xl"
      >
        <StaffForm
          key={editing?.id ?? "new"}
          editing={editing}
          phases={phases}
          classes={classes}
          roleOptions={roleOptions}
          busy={busy}
          onSubmit={submit}
        />
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="بيانات الدخول المولّدة">
        {issued && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              تم إنشاء حساب <strong>{issued.fullName}</strong>. سلّم البيانات التالية للخادم، ويمكنه تغيير كلمة المرور من صفحة
              «حسابي».
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
              هل أنت متأكد من حذف <strong>{deleteTarget.fullName}</strong> ({roleLabel(deleteTarget.role)})؟ سيتم إعادة إسناد
              سجلات الحضور التي أصدرها إليك، ولا يمكن التراجع عن الحذف.
            </p>
            {deleteTarget.role === "CHURCH_ADMIN" && !me?.isFirstAdmin && (
              <p className="rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
                حذف أدمن الكنيسة متاح للأدمن الأساسي للكنيسة فقط.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                className="flex-1"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                نعم، حذف نهائي
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function StaffForm({
  editing,
  phases,
  classes,
  roleOptions,
  busy,
  onSubmit,
}: {
  editing: StaffRow | null;
  phases: PhaseOption[];
  classes: ClassOption[];
  roleOptions: RoleOption[];
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [role, setRole] = useState<string>(editing?.role ?? roleOptions[0]?.value ?? "PHASE_SERVANT");
  const [phaseId, setPhaseId] = useState<string>(editing?.phaseId ?? "");

  const phaseClasses = classes.filter((item) => item.phaseId === phaseId);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Select name="role" label="الدور" value={role} onChange={(e) => setRole(e.target.value)}>
        {roleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {role === "PHASE_ADMIN" && (
        <Select name="sector" label="القطاع المسؤول عنه" defaultValue={editing?.sector ?? ""} required>
          <option value="" disabled>
            اختر القطاع
          </option>
          {SECTORS.map((sector) => (
            <option key={sector.key} value={sector.key}>
              {sector.name} — كود القطاع: {sector.abbreviation}
            </option>
          ))}
        </Select>
      )}

      {role === "PHASE_SERVANT" && (
        <Select
          name="phaseId"
          label="المرحلة (مرحلة واحدة فقط)"
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
          required
        >
          <option value="" disabled>
            اختر المرحلة
          </option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name} ({phase.abbreviation})
            </option>
          ))}
        </Select>
      )}

      {role !== "CHURCH_ADMIN" && (
        <Select name="classId" label="الفصل (اختياري)" defaultValue={editing?.classId ?? ""}>
          <option value="">بدون فصل</option>
          {phaseClasses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      )}

      <Input name="fullName" label="الاسم الرباعي" required defaultValue={editing?.fullName ?? ""} />
      <Input name="phone" label="رقم التليفون" required inputMode="tel" defaultValue={editing?.phone ?? ""} />
      <Input
        name="secondaryPhone"
        label="رقم تليفون إضافي (اختياري)"
        inputMode="tel"
        defaultValue={editing?.secondaryPhone ?? ""}
      />
      <Input name="email" label="البريد الإلكتروني (اختياري)" type="email" defaultValue={editing?.email ?? ""} />
      <Input name="address" label="العنوان (اختياري)" defaultValue={editing?.address ?? ""} />

      {editing && (
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <input type="checkbox" name="regenerateCredentials" className="h-4 w-4 accent-[var(--color-emerald)]" />
          <span className="text-sm font-semibold">توليد كلمة مرور أولية جديدة الآن</span>
        </label>
      )}

      <p className="rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        يتم توليد اسم المستخدم وكلمة المرور تلقائياً حسب الصيغة:{" "}
        <span className="font-mono">{"{church}_admin_{5}"}</span> لأدمن الكنيسة،{" "}
        <span className="font-mono">{"{church}_admin_{phase}_{5}"}</span> لأدمن القطاع،{" "}
        <span className="font-mono">{"{church}_{phase}_{5}"}</span> للخادم.
      </p>

      <Button type="submit" className="w-full" disabled={busy}>
        <UserPlus2 className="h-4 w-4" />
        {busy ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الخادم وتوليد بيانات الدخول"}
      </Button>
    </form>
  );
}

