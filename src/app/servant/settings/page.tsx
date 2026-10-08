"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchJsonWithCache } from "@/lib/offline-db";
import { apiMutate } from "@/lib/offline-mutations";

type PhaseOption = { id: string; name: string; abbreviation: string; sector: string };

export default function SettingsPage() {
  const { user, church, loading, can } = useAuth();
  const router = useRouter();
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [massPoints, setMassPoints] = useState(5);
  const [servicePoints, setServicePoints] = useState(3);

  const canSettings = can("manageChurchSettings");

  async function load() {
    try {
      // Network-First with IndexedDB fallback — settings open offline too.
      const [settingsHit, phasesHit] = await Promise.all([
        fetchJsonWithCache<{ settings: { defaultMassPoints: number; defaultServicePoints: number } }>(
          "/api/church/settings"
        ),
        fetchJsonWithCache<{ phases: PhaseOption[] }>("/api/phases"),
      ]);
      const settings = settingsHit.data.settings;
      setMassPoints(settings.defaultMassPoints);
      setServicePoints(settings.defaultServicePoints);
      setPhases(phasesHit.data.phases ?? []);
    } catch {
      /* offline with no saved copy yet — keep current values */
    }
  }

  async function saveDefaults(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const out = await apiMutate("/api/church/settings", "PATCH", {
        defaultMassPoints: massPoints,
        defaultServicePoints: servicePoints,
      });
      if (out.queued) toast.info("تم حفظ الإعدادات محلياً — ستتم المزامنة عند عودة الاتصال");
      else toast.success("تم حفظ النقاط الافتراضية");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user || !canSettings) {
      router.replace("/servant");
      return;
    }
    void load();
  }, [user, loading, router, canSettings]);


  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-5 text-2xl font-black text-[var(--color-navy)]">إعدادات الكنيسة</h1>

        <div className="glass mb-6 rounded-3xl p-5">
          <p className="text-sm text-slate-500">اسم الكنيسة</p>
          <p className="text-xl font-black text-[var(--color-navy)]">{church?.name}</p>
          <p className="mt-4 text-sm text-slate-500">كود الكنيسة بالإنجليزية (يُستخدم في توليد أسماء المستخدمين)</p>
          <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--color-navy)]">
            {church?.abbreviation ?? "—"}
          </p>
          {church?.licenseKey && (
            <>
              <p className="mt-4 text-sm text-slate-500">مفتاح الترخيص (للمخدومين عند التسجيل)</p>
              <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--color-gold)]">{church.licenseKey}</p>
            </>
          )}
          <p className="mt-3 text-xs text-slate-400">
            تعديل كود الكنيسة متاح لمدير النظام فقط للحفاظ على صحة أسماء المستخدمين الحالية.
          </p>
        </div>

        <form onSubmit={saveDefaults} className="glass mb-6 grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
          <h2 className="sm:col-span-2 font-black text-[var(--color-navy)]">نقاط المسح الافتراضية</h2>
          <Input
            label="نقاط القداس الافتراضية"
            type="number"
            value={massPoints}
            onChange={(e) => setMassPoints(Number(e.target.value))}
          />
          <Input
            label="نقاط الحضور الافتراضية"
            type="number"
            value={servicePoints}
            onChange={(e) => setServicePoints(Number(e.target.value))}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </form>

        <div className="glass mb-6 rounded-3xl p-5">
          <h2 className="mb-2 font-black text-[var(--color-navy)]">مراحل الكنيسة ({phases.length})</h2>
          <p className="mb-3 text-xs text-slate-500">
            المراحل تتضمن كوداً إنجليزياً يستخدم في توليد أسماء المستخدمين، مثل{" "}
            <span className="font-mono">{church?.abbreviation ?? "church"}_prep1_59201</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {phases.map((phase) => (
              <span key={phase.id} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                {phase.name} <span className="font-mono text-[10px] text-slate-400">({phase.abbreviation})</span>
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/servant/staff" className="text-sm font-bold text-[var(--color-emerald)]">
              إدارة الخدام ←
            </Link>
            <Link href="/servant/classes" className="mr-4 text-sm font-bold text-[var(--color-emerald)]">
              إدارة الفصول ←
            </Link>
            <Link href="/servant/events" className="mr-4 text-sm font-bold text-[var(--color-emerald)]">
              إدارة المناسبات ←
            </Link>
          </div>
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}

