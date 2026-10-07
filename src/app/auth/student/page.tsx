"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input, Select, TextArea } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { GRADES, ROLE_HOME } from "@/lib/utils";

export default function StudentAuthPage() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [loggingIn, setLoggingIn] = useState(false);
  const [isMotherWorking, setIsMotherWorking] = useState(false);
  const { user, loading, setAuth } = useAuth();
  const router = useRouter();

  // Same PWA guard as `/`: a live session can never render this form.
  useEffect(() => {
    if (loading || !user) return;
    router.replace(user.role === "STUDENT" ? "/student" : ROLE_HOME[user.role] ?? "/servant");
  }, [user, loading, router]);

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoggingIn(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchLicenseKey: String(fd.get("churchLicenseKey") || ""),
          username: String(fd.get("username") || ""),
          pin: String(fd.get("pin") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الدخول");
      setAuth(data.user, data.church);
      toast.success(`أهلاً ${data.user.fullName}`);
      router.replace("/student");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoggingIn(false);
    }
  }

  async function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoggingIn(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/student-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchLicenseKey: String(fd.get("churchLicenseKey") || ""),
          fullName: String(fd.get("fullName") || ""),
          address: String(fd.get("address") || ""),
          grade: String(fd.get("grade") || ""),
          phone: String(fd.get("phone") || ""),
          secondaryPhone: String(fd.get("secondaryPhone") || "") || null,
          birthDate: String(fd.get("birthDate") || "") || null,
          confessionFather: String(fd.get("confessionFather") || "") || null,
          fatherJob: String(fd.get("fatherJob") || "") || null,
          isMotherWorking,
          motherJob: isMotherWorking ? String(fd.get("motherJob") || "") || null : null,
          pin: String(fd.get("pin") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التسجيل");
      setAuth(data.user, data.church);
      toast.success("تم التسجيل وإنشاء بطاقة الـ ID");
      router.replace("/student");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoggingIn(false);
    }
  }

  if (loading || user) {
    return <PageShell><p className="py-20 text-center text-sm font-bold text-slate-500">جارٍ التحقق من الجلسة...</p></PageShell>;
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <BrandMark />
        <Link href="/" className="text-sm font-bold text-slate-500">
          رجوع
        </Link>
      </div>

      <div className="mb-6 flex rounded-2xl bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${mode === "login" ? "bg-[var(--color-navy)] text-white" : "text-slate-500"}`}
        >
          دخول
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${mode === "register" ? "bg-[var(--color-navy)] text-white" : "text-slate-500"}`}
        >
          تسجيل جديد
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={onLogin} className="glass space-y-4 rounded-3xl p-5">
          <h1 className="text-2xl font-black text-[var(--color-navy)]">دخول المخدوم</h1>
          <p className="text-sm text-slate-600">ادخل اسم المستخدم المولّد لك (مثال: mar_ph_user_53971) + الرقم السري (PIN).</p>
          <Input name="churchLicenseKey" label="مفتاح ترخيص الكنيسة (اختياري)" placeholder="TAYOO-...." />
          <Input name="username" label="اسم المستخدم" placeholder="mar_ph_user_53971" required autoComplete="username" />
          <Input name="pin" label="الرقم السري (PIN)" type="password" required minLength={4} />
          <Button type="submit" className="w-full" disabled={loggingIn}>
            {loggingIn ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onRegister} className="glass space-y-4 rounded-3xl p-5">
          <h1 className="text-2xl font-black text-[var(--color-navy)]">تسجيل مخدوم جديد</h1>
          <Input name="churchLicenseKey" label="مفتاح ترخيص الكنيسة" required placeholder="TAYOO-...." />
          <Input name="fullName" label="الاسم الرباعي" required />
          <TextArea name="address" label="العنوان بالكامل" required />
          <Select name="grade" label="المرحلة الدراسية" required defaultValue="1 إعدادي">
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Input name="phone" label="رقم التليفون" required inputMode="tel" />
          <Input name="secondaryPhone" label="رقم تليفون إضافي / ولي الأمر" inputMode="tel" />
          <Input name="birthDate" label="تاريخ الميلاد" type="date" />
          <Input name="confessionFather" label="أب الاعتراف" />
          <Input name="fatherJob" label="وظيفة الأب" />
          <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 border border-slate-200">
            <input
              type="checkbox"
              checked={isMotherWorking}
              onChange={(e) => setIsMotherWorking(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-emerald)]"
            />
            <span className="text-sm font-semibold">هل الأم تعمل؟</span>
          </label>
          {isMotherWorking && <Input name="motherJob" label="وظيفة الأم" />}
          <Input name="pin" label="اختر رقم سري (PIN) من 4–8 أرقام" type="password" required minLength={4} maxLength={8} />
          <Button type="submit" className="w-full" disabled={loggingIn}>
            {loggingIn ? "جارٍ التسجيل..." : "تسجيل وإنشاء الـ ID"}
          </Button>
        </form>
      )}
    </PageShell>
  );
}
