"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/providers/auth-provider";

type ChurchRow = {
  id: string;
  name: string;
  abbreviation: string;
  licenseKey: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  phaseCount: number;
  classCount: number;
  eventCount: number;
  transactionCount: number;
};

type Totals = {
  churches: number;
  activeChurches: number;
  students: number;
  servants: number;
};

type IssuedAdmin = {
  churchName: string;
  abbreviation: string;
  licenseKey: string;
  fullName: string;
  username: string;
  initialPassword: string;
};

export default function SuperAdminPage() {
  const { user, loading, setAuth, logout } = useAuth();
  const router = useRouter();
  const [needLogin, setNeedLogin] = useState(false);
  const [churches, setChurches] = useState<ChurchRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedAdmin | null>(null);

  async function load() {
    const res = await fetch("/api/super-admin/churches");
    if (res.status === 401 || res.status === 403) {
      setNeedLogin(true);
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setChurches(data.churches);
    setTotals(data.totals);
    setNeedLogin(false);
  }

  useEffect(() => {
    if (loading) return;
    if (user && user.role !== "SUPER_ADMIN") {
      router.replace(user.role === "STUDENT" ? "/" : "/admin121210");
      return;
    }
    if (!user) {
      setNeedLogin(true);
      return;
    }
    void load();
  }, [user, loading, router]);

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: String(fd.get("identifier") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الدخول");
      if (data.user.role !== "SUPER_ADMIN") throw new Error("هذه البوابة للمدير العام فقط");
      setAuth(data.user, data.church);
      toast.success("مرحباً مدير النظام");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateChurch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/super-admin/churches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") || ""),
          abbreviation: String(fd.get("abbreviation") || ""),
          adminFullName: String(fd.get("adminFullName") || ""),
          adminPhone: String(fd.get("adminPhone") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإنشاء");
      setIssued({
        churchName: data.church.name,
        abbreviation: data.church.abbreviation,
        licenseKey: data.church.licenseKey,
        fullName: data.admin.fullName,
        username: data.admin.username,
        initialPassword: data.admin.initialPassword,
      });
      toast.success(`تم إنشاء ${data.church.name} مع الأدمن الأساسي`);
      e.currentTarget.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleChurch(church: ChurchRow) {
    const res = await fetch("/api/super-admin/churches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: church.id, isActive: !church.isActive }),
    });
    if (!res.ok) {
      toast.error("تعذر التحديث");
      return;
    }
    toast.success(church.isActive ? "تم إيقاف الكنيسة" : "تم تفعيل الكنيسة");
    await load();
  }

  async function updateAbbreviation(church: ChurchRow) {
    const value = window.prompt(
      "كود الكنيسة بالإنجليزية (حروف صغيرة وأرقام وشرطة سفلية، يُستخدم في توليد أسماء المستخدمين)",
      church.abbreviation
    );
    if (!value || value.trim() === church.abbreviation) return;
    const res = await fetch("/api/super-admin/churches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: church.id, abbreviation: value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "تعذر التعديل");
      return;
    }
    toast.success("تم تحديث كود الكنيسة");
    await load();
  }

  async function deleteChurch(church: ChurchRow) {
    const confirmation = window.prompt(`اكتب اسم الكنيسة بالكامل للتأكيد: ${church.name}`);
    if (confirmation === null) return;
    const res = await fetch("/api/super-admin/churches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: church.id, confirmation }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "تعذر الحذف");
      return;
    }
    toast.success("تم حذف الكنيسة");
    await load();
  }
if (needLogin || (!user && !loading)) {
    return (
      <PageShell>
        <BrandMark />
        <form onSubmit={onLogin} className="glass mx-auto mt-8 max-w-md space-y-4 rounded-3xl p-6">
          <h1 className="text-2xl font-black text-[var(--color-navy)]">بوابة المدير العام</h1>
          <Input name="identifier" label="اسم المستخدم أو رقم التليفون" required placeholder="01211931285" />
          <Input name="password" label="كلمة المرور" type="password" required />
          <Button type="submit" className="w-full" disabled={busy}>
            دخول سري
          </Button>
        </form>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <BrandMark />
        <Button variant="ghost" onClick={() => logout()}>
          خروج
        </Button>
      </div>

      <h1 className="mb-4 text-2xl font-black text-[var(--color-navy)]">إدارة تراخيص الكنائس</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="الكنائس" value={totals?.churches ?? 0} />
        <Stat label="مفعّلة" value={totals?.activeChurches ?? 0} />
        <Stat label="المخدومين" value={totals?.students ?? 0} />
        <Stat label="الخدام" value={totals?.servants ?? 0} />
      </div>

      <form onSubmit={onCreateChurch} className="glass mb-8 grid gap-3 rounded-3xl p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-black text-[var(--color-navy)]">إنشاء كنيسة + ترخيص + أدمن أساسي</h2>
        <Input name="name" label="اسم الكنيسة" required placeholder="كنيسة..." />
        <Input
          name="abbreviation"
          label="كود الكنيسة بالإنجليزية (Abbreviation)"
          required
          placeholder="mar_girgis"
          pattern="[a-zA-Z0-9_\- ]{2,30}"
          title="حروف إنجليزية وأرقام وشرطة سفلية"
        />
        <Input name="adminFullName" label="اسم أدمن الكنيسة (الأدمن الأساسي)" required />
        <Input name="adminPhone" label="تليفون الأدمن" required inputMode="tel" />
        <p className="md:col-span-2 rounded-2xl bg-white p-3 text-xs leading-relaxed text-slate-600">
          يتم توليد اسم المستخدم وكلمة المرور تلقائياً للأدمن الأساسي بالصيغة{" "}
          <span className="font-mono">{"{church}_admin_{5 أرقام}"}</span> — مثال:{" "}
          <span className="font-mono">mar_girgis_admin_48291</span>. كما تُنشأ جميع المراحل الافتراضية (KG1 → خريج) مع كود
          إنجليزي لكل مرحلة.
        </p>
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? "جارٍ الإنشاء..." : "إنشاء وتفعيل الترخيص"}
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {churches.map((c) => (
          <div key={c.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-black text-[var(--color-navy)]">{c.name}</p>
                <p className="mt-1 font-mono text-sm font-bold text-[var(--color-navy)]">
                  كود الكنيسة: {c.abbreviation}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--color-gold)]">{c.licenseKey}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {c.userCount} مستخدم · {c.phaseCount} مرحلة · {c.classCount} فصل · {c.eventCount} مناسبة ·{" "}
                  {c.transactionCount} معاملة
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => void updateAbbreviation(c)}>
                  تعديل الكود
                </Button>
                <Button size="sm" variant={c.isActive ? "danger" : "primary"} onClick={() => void toggleChurch(c)}>
                  {c.isActive ? "إيقاف" : "تفعيل"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => void deleteChurch(c)}>
                  حذف الكنيسة نهائياً
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="بيانات الأدمن الأساسي">
        {issued && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              تم إنشاء كنيسة <strong>{issued.churchName}</strong> بكود{" "}
              <span className="font-mono font-bold">{issued.abbreviation}</span>. سلّم بيانات الدخول التالية للأدمن الأساسي —
              وهو الوحيد الذي يمكنه حذف أدمنة الكنيسة الآخرين.
            </p>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs text-slate-500">الاسم</p>
              <p className="font-bold text-[var(--color-navy)]">{issued.fullName}</p>
              <p className="mt-3 text-xs text-slate-500">اسم المستخدم</p>
              <p className="font-mono text-lg font-black text-[var(--color-navy)]">{issued.username}</p>
              <p className="mt-3 text-xs text-slate-500">كلمة المرور الأولية</p>
              <p className="font-mono text-lg font-black text-[var(--color-gold)]">{issued.initialPassword}</p>
              <p className="mt-3 text-xs text-slate-500">مفتاح ترخيص الكنيسة (للمخدومين)</p>
              <p className="font-mono text-xs font-bold text-slate-700">{issued.licenseKey}</p>
            </div>
            <Button type="button" className="w-full" onClick={() => setIssued(null)}>
              تم — إغلاق
            </Button>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-2xl font-black text-[var(--color-navy)]">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
