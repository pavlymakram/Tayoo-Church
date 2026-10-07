"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { ROLE_HOME } from "@/lib/utils";

export default function SecretAdminPortal() {
  const { user, loading, setAuth } = useAuth(); const router = useRouter(); const [loggingIn, setLoggingIn] = useState(false);

  // PWA Back-button guard: authed staff are bounced home, never see this gate.
  useEffect(() => {
    if (loading || !user) return;
    if (user.role === "STUDENT") {
      router.replace(ROLE_HOME.STUDENT);
      return;
    }
    router.replace(ROLE_HOME[user.role] ?? "/servant");
  }, [user, loading, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoggingIn(true); const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "staff", identifier: form.get("code"), secret: form.get("secret") }) });
      const text = await res.text();
      let data: { error?: string; user?: unknown; church?: unknown; redirectTo?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error(`تعذر الاتصال بالخادم (HTTP ${res.status}) — تحقق من إعدادات قاعدة البيانات`);
      }
      if (!res.ok) throw new Error(data.error || "فشل الدخول");
      setAuth(data.user as Parameters<typeof setAuth>[0], (data.church as Parameters<typeof setAuth>[1] | undefined) ?? null);
      // replace() drops the gate from history — Back never returns here.
      router.replace(data.redirectTo || "/");
    } catch (error) { toast.error(error instanceof Error ? error.message : "حدث خطأ"); } finally { setLoggingIn(false); }
  }
  if (loading || user) {
    return <PageShell><p className="py-20 text-center text-sm font-bold text-slate-500">جارٍ التحقق من الجلسة...</p></PageShell>;
  }
  return <PageShell><div className="mb-7"><BrandMark /></div><form onSubmit={submit} className="glass mx-auto max-w-md space-y-4 rounded-3xl p-6"><h1 className="text-2xl font-black text-[var(--color-navy)]">بوابة التحكم والإدارة</h1><p className="text-sm text-slate-600">للخدام وأدمن الكنيسة ومدير النظام فقط — استخدم اسم المستخدم المولّد تلقائياً وكلمة المرور.</p>
    <Input name="code" label="اسم المستخدم أو رقم التليفون" placeholder="mar_girgis_admin_48291" required autoComplete="username" />
    <Input name="secret" label="كلمة المرور" type="password" required autoComplete="current-password" />
    <Button type="submit" className="w-full" disabled={loggingIn}>{loggingIn ? "جارٍ التحقق..." : "دخول البوابة"}</Button>
    <p className="text-center text-xs text-slate-500">للحصول على بيانات الدخول تواصل مع أدمن الكنيسة.</p>
  </form></PageShell>;
}
