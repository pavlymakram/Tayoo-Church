"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { ROLE_LABELS, roleLabel } from "@/lib/utils";
import { sectorLabel } from "@/lib/phases";

/** Profile settings — every account can rotate its own password. */
export default function ProfilePage() {
  const { user, church, loading, role } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || role === "STUDENT") router.replace("/servant");
  }, [user, loading, router, role]);

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const currentSecret = String(fd.get("currentSecret") || "");
    const newSecret = String(fd.get("newSecret") || "");
    const confirm = String(fd.get("confirmSecret") || "");
    if (newSecret !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/profile/secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "password", currentSecret, newSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تغيير كلمة المرور");
      toast.success("تم تحديث كلمة المرور — كلمة المرور الأولية أُلغيت");
      e.currentTarget.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <PageShell withStaffNav>
        <div className="py-20 text-center text-slate-500">جارٍ التحميل...</div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-5 text-2xl font-black text-[var(--color-navy)]">حسابي</h1>

        <div className="glass mb-6 space-y-2 rounded-3xl p-5">
          <p className="text-lg font-black text-[var(--color-navy)]">{user.fullName}</p>
          <p className="text-sm text-slate-600">{ROLE_LABELS[role] ?? roleLabel(role)}</p>
          <p className="font-mono text-sm font-bold text-[var(--color-gold)]">{user.username ?? "—"}</p>
          <p className="text-xs text-slate-500">
            {church?.name}
            {church?.abbreviation ? ` · كود الكنيسة ${church.abbreviation}` : ""}
          </p>
          {user.sector && <p className="text-xs text-slate-500">القطاع: {sectorLabel(user.sector)}</p>}
          {user.phaseName && <p className="text-xs text-slate-500">المرحلة: {user.phaseName}</p>}
          {user.className && <p className="text-xs text-slate-500">الفصل: {user.className}</p>}
          <p className="text-xs text-slate-500">رقم التليفون: {user.phone}</p>
          {user.isFirstAdmin && (
            <p className="mt-2 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              <ShieldCheck className="h-4 w-4" /> أنت الأدمن الأساسي للكنيسة — لك وحدك صلاحية حذف أدمنة الكنيسة الآخرين.
            </p>
          )}
        </div>

        <form onSubmit={changePassword} className="glass space-y-3 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-black text-[var(--color-navy)]">
            <KeyRound className="h-4 w-4" /> تغيير كلمة المرور
          </h2>
          <Input name="currentSecret" label="كلمة المرور الحالية" type="password" required />
          <Input name="newSecret" label="كلمة المرور الجديدة (8 أحرف على الأقل)" type="password" minLength={8} required />
          <Input name="confirmSecret" label="تأكيد كلمة المرور الجديدة" type="password" minLength={8} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
          </Button>
        </form>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}
