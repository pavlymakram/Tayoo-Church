"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";

export default function StudentLoginPage() {
  const { setAuth } = useAuth(); const router = useRouter(); const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "student", identifier: form.get("identifier"), secret: form.get("secret") }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "فشل الدخول");
      setAuth(data.user, data.church); router.replace("/student/dashboard");
    } catch (error) { toast.error(error instanceof Error ? error.message : "حدث خطأ"); } finally { setLoading(false); }
  }
  return <PageShell><div className="mb-7 flex items-center justify-between"><BrandMark /><Link href="/auth/student" className="text-sm font-bold text-slate-500">تسجيل مخدوم جديد</Link></div>
    <form onSubmit={submit} className="glass mx-auto max-w-md space-y-4 rounded-3xl p-6"><h1 className="text-2xl font-black text-[var(--color-navy)]">دخول المخدومين</h1><p className="text-sm text-slate-600">سجّل باسم المستخدم المولّد لك (مثال: mar_ph_user_53971) + الرقم السري (PIN).</p>
      <Input name="identifier" label="اسم المستخدم" placeholder="mar_ph_user_53971" required autoComplete="username" />
      <Input name="secret" label="الرقم السري (PIN)" type="password" required inputMode="numeric" />
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "جارٍ الدخول..." : "دخول"}</Button>
    </form></PageShell>;
}
