"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { AccessCodeManager } from "@/components/admin/access-code-manager";

type Servant = {
  id: string;
  fullName: string;
  phone: string;
  role: string;
};

export default function SettingsPage() {
  const { user, church, loading } = useAuth();
  const router = useRouter();
  const [servants, setServants] = useState<Servant[]>([]);
  const [saving, setSaving] = useState(false);
  const [massPoints, setMassPoints] = useState(5);
  const [servicePoints, setServicePoints] = useState(3);

  async function load() {
    const res = await fetch("/api/servants");
    if (!res.ok) return;
    const data = await res.json();
    setServants(data.servants);
    const settingsRes = await fetch("/api/church/settings");
    if (settingsRes.ok) {
      const settings = (await settingsRes.json()).settings;
      setMassPoints(settings.defaultMassPoints);
      setServicePoints(settings.defaultServicePoints);
    }
  }

  async function saveDefaults(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch("/api/church/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultMassPoints: massPoints, defaultServicePoints: servicePoints }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر حفظ الإعدادات");
      toast.success("تم حفظ النقاط الافتراضية");
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== "CHURCH_ADMIN") {
      router.replace("/servant");
      return;
    }
    void load();
  }, [user, loading, router]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/servants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(fd.get("fullName") || ""),
          phone: String(fd.get("phone") || ""),
          email: String(fd.get("email") || ""),
          password: String(fd.get("password") || ""),
          securityCode: String(fd.get("securityCode") || ""),
          role: String(fd.get("role") || "SERVANT"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإضافة");
      toast.success("تمت إضافة الخادم");
      e.currentTarget.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-5 text-2xl font-black text-[var(--color-navy)]">إعدادات الكنيسة</h1>

        <div className="glass mb-6 rounded-3xl p-5">
          <p className="text-sm text-slate-500">اسم الكنيسة</p>
          <p className="text-xl font-black text-[var(--color-navy)]">{church?.name}</p>
          {church?.licenseKey && (
            <>
              <p className="mt-4 text-sm text-slate-500">مفتاح الترخيص (للمخدومين عند التسجيل)</p>
              <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--color-gold)]">
                {church.licenseKey}
              </p>
            </>
          )}
        </div>

        <form onSubmit={saveDefaults} className="glass mb-6 grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
          <h2 className="sm:col-span-2 font-black text-[var(--color-navy)]">نقاط المسح السريع الافتراضية</h2>
          <Input label="نقاط القداس الافتراضية" type="number" value={massPoints} onChange={(e) => setMassPoints(Number(e.target.value))} />
          <Input label="نقاط الخدمة الافتراضية" type="number" value={servicePoints} onChange={(e) => setServicePoints(Number(e.target.value))} />
          <div className="sm:col-span-2"><Button type="submit" disabled={saving}>حفظ الإعدادات</Button></div>
        </form>

        <form onSubmit={onCreate} className="glass mb-6 space-y-3 rounded-3xl p-5">
          <h2 className="font-black text-[var(--color-navy)]">إضافة خادم</h2>
          <Input name="fullName" label="الاسم" required />
          <Input name="phone" label="رقم التليفون" required />
          <Input name="password" label="كلمة المرور" type="password" required minLength={6} />
          <Select name="role" label="الدور" defaultValue="SERVANT">
            <option value="SERVANT">خادم</option>
            <option value="CHURCH_ADMIN">أدمن كنيسة</option>
          </Select>
          <Input name="email" label="البريد الإلكتروني (اختياري)" type="email" />
          <Input name="securityCode" label="كود الخادم / الأدمن (اختياري)" type="password" minLength={4} />
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "جارٍ الحفظ..." : "إضافة"}
          </Button>
        </form>

        <AccessCodeManager />

        <div className="space-y-2">
          {servants.map((s) => (
            <div key={s.id} className="glass flex items-center justify-between rounded-2xl px-4 py-3">
              <div>
                <p className="font-bold">{s.fullName}</p>
                <p className="text-xs text-slate-500">{s.phone}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                {s.role === "CHURCH_ADMIN" ? "أدمن" : "خادم"}
              </span>
            </div>
          ))}
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}
