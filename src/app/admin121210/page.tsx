"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";

export default function SecretAdminPortal() {
  const { setAuth } = useAuth(); const router = useRouter(); const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "staff", identifier: form.get("code"), secret: form.get("secret") }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "فشل الدخول");
      setAuth(data.user, data.church); router.replace(data.redirectTo);
    } catch (error) { toast.error(error instanceof Error ? error.message : "حدث خطأ"); } finally { setLoading(false); }
  }
  return <PageShell><div className="mb-7"><BrandMark /></div><form onSubmit={submit} className="glass mx-auto max-w-md space-y-4 rounded-3xl p-6"><h1 className="text-2xl font-black text-[var(--color-navy)]">بوابة التحكم والإدارة</h1><p className="text-sm text-slate-600">للخدام وأدمن الكنيسة ومدير النظام فقط — استخدم اسم المستخدم المولّد تلقائياً وكلمة المرور.</p>
    <Input name="code" label="اسم المستخدم أو رقم التليفون" placeholder="mar_girgis_admin_48291" required autoComplete="username" />
    <Input name="secret" label="كلمة المرور" type="password" required autoComplete="current-password" />
    <Button type="submit" className="w-full" disabled={loading}>{loading ? "جارٍ التحقق..." : "دخول البوابة"}</Button>
    <p className="text-center text-xs text-slate-500">للحصول على بيانات الدخول تواصل مع أدمن الكنيسة.</p>
  </form></PageShell>;
}
