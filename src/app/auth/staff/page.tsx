"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandMark, PageShell } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";

export default function StaffAuthPage() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
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
      setAuth(data.user, data.church);
      toast.success(`أهلاً ${data.user.fullName}`);
      if (data.user.role === "SUPER_ADMIN") router.replace("/super-admin");
      else router.replace("/servant");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <BrandMark />
        <Link href="/" className="text-sm font-bold text-slate-500">
          رجوع
        </Link>
      </div>

      <form onSubmit={onSubmit} className="glass mx-auto max-w-md space-y-4 rounded-3xl p-6">
        <h1 className="text-2xl font-black text-[var(--color-navy)]">دخول الخادم</h1>
        <p className="text-sm text-slate-600">سجّل الدخول برقم التليفون وكلمة المرور</p>
        <Input name="phone" label="رقم التليفون" required inputMode="tel" placeholder="01xxxxxxxxx" />
        <Input name="password" label="كلمة المرور" type="password" required />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "جارٍ الدخول..." : "دخول لوحة الخدمة"}
        </Button>
      </form>
    </PageShell>
  );
}
