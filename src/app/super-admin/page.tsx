"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { AccessCodeManager } from "@/components/admin/access-code-manager";

type ChurchRow = {
  id: string;
  name: string;
  licenseKey: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  eventCount: number;
  transactionCount: number;
};

type Totals = {
  churches: number;
  activeChurches: number;
  students: number;
  servants: number;
};

export default function SuperAdminPage() {
  const { user, loading, setAuth, logout } = useAuth();
  const router = useRouter();
  const [needLogin, setNeedLogin] = useState(false);
  const [churches, setChurches] = useState<ChurchRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);

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
      router.replace("/");
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
          phone: String(fd.get("phone") || ""),
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
          adminFullName: String(fd.get("adminFullName") || ""),
          adminPhone: String(fd.get("adminPhone") || ""),
          adminPassword: String(fd.get("adminPassword") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإنشاء");
      toast.success(`تم إنشاء ${data.church.name}`);
      e.currentTarget.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleChurch(c: ChurchRow) {
    const res = await fetch("/api/super-admin/churches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
    });
    if (!res.ok) toast.error("تعذر التحديث");
    else {
      toast.success(c.isActive ? "تم إيقاف الترخيص" : "تم تفعيل الترخيص");
      await load();
    }
  }

  async function deleteChurch(c: ChurchRow) {
    const confirmation = window.prompt(`حذف نهائي: اكتب اسم الكنيسة كما هو لتأكيد حذف كل بياناتها:\n${c.name}`);
    if (confirmation === null) return;
    const res = await fetch("/api/super-admin/churches", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, confirmation }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "تعذر حذف الكنيسة"); return; }
    toast.success("تم حذف الكنيسة وكل بياناتها نهائياً");
    await load();
  }

  if (needLogin || (!user && !loading)) {
    return (
      <PageShell>
        <BrandMark />
        <form onSubmit={onLogin} className="glass mx-auto mt-8 max-w-md space-y-4 rounded-3xl p-6">
          <h1 className="text-2xl font-black text-[var(--color-navy)]">بوابة المدير العام</h1>
          <Input name="phone" label="رقم التليفون" required />
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
        <h2 className="md:col-span-2 font-black text-[var(--color-navy)]">إنشاء كنيسة + ترخيص</h2>
        <Input name="name" label="اسم الكنيسة" required placeholder="كنيسة..." />
        <Input name="adminFullName" label="اسم أدمن الكنيسة" required />
        <Input name="adminPhone" label="تليفون الأدمن" required />
        <Input name="adminPassword" label="كلمة مرور الأدمن" type="password" required minLength={6} />
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            إنشاء وتفعيل الترخيص
          </Button>
        </div>
      </form>

      <AccessCodeManager superAdmin churches={churches.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="space-y-3">
        {churches.map((c) => (
          <div key={c.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-[var(--color-navy)]">{c.name}</p>
                <p className="mt-1 font-mono text-xs text-[var(--color-gold)]">{c.licenseKey}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {c.userCount} مستخدم · {c.eventCount} مناسبة · {c.transactionCount} معاملة
                </p>
              </div>
              <Button
                size="sm"
                variant={c.isActive ? "danger" : "primary"}
                onClick={() => void toggleChurch(c)}
              >
                {c.isActive ? "إيقاف" : "تفعيل"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => void deleteChurch(c)}>
                حذف الكنيسة نهائياً
              </Button>
            </div>
          </div>
        ))}
      </div>
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
