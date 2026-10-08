"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { Button, Input } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchJsonWithCache } from "@/lib/offline-db";
import { apiMutate } from "@/lib/offline-mutations";

type EventType = {
  id: string;
  title: string;
  defaultPoints: number;
  isActive: boolean;
};

export default function EventsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventType[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      // Network-First with IndexedDB fallback — the list opens offline too.
      const { data } = await fetchJsonWithCache<{ events: EventType[] }>("/api/events");
      setEvents(data.events ?? []);
    } catch {
      /* offline with no saved copy yet — keep the current list */
    }
  }

  // Refresh after the background sync flushes locally saved operations.
  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener("tayoo:offline-synced", onSynced);
    return () => window.removeEventListener("tayoo:offline-synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const title = String(fd.get("title") || "");
    const defaultPoints = Number(fd.get("defaultPoints") || 0);
    try {
      const out = await apiMutate<{ events?: EventType[] }>("/api/events", "POST", {
        title,
        defaultPoints,
        isActive: true,
      });
      if (out.queued) {
        // Offline: keep the new event visible locally; it syncs later.
        setEvents((prev) => [
          ...prev,
          { id: `queued-${Date.now()}`, title, defaultPoints, isActive: true },
        ]);
        toast.info("تم حفظ المناسبة محلياً — ستتم المزامنة عند عودة الاتصال");
      } else {
        toast.success("تمت إضافة المناسبة");
      }
      e.currentTarget.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ev: EventType) {
    try {
      const out = await apiMutate("/api/events", "PATCH", {
        id: ev.id,
        isActive: !ev.isActive,
      });
      // Optimistic toggle so the UI responds instantly (online or offline).
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, isActive: !e.isActive } : e))
      );
      if (out.queued) toast.info("تم الحفظ محلياً — ستتم المزامنة عند عودة الاتصال");
      else toast.success(ev.isActive ? "تم تعطيل المناسبة" : "تم تفعيل المناسبة");
      await load();
    } catch {
      toast.error("تعذر التحديث");
    }
  }

  async function updatePoints(id: string, defaultPoints: number) {
    try {
      const out = await apiMutate("/api/events", "PATCH", { id, defaultPoints });
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, defaultPoints } : e)));
      if (out.queued) toast.info("تم الحفظ محلياً — ستتم المزامنة عند عودة الاتصال");
      else toast.success("تم تحديث النقط الافتراضية");
    } catch {
      toast.error("تعذر الحفظ");
    }
    await load();
  }

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-5 text-2xl font-black text-[var(--color-navy)]">إدارة المناسبات والفعاليات</h1>

        <form onSubmit={onCreate} className="glass mb-6 grid gap-3 rounded-3xl p-5 sm:grid-cols-[1fr_120px_auto]">
          <Input name="title" label="إضافة مناسبة جديدة" placeholder="مثال: نهضة العذراء" required />
          <Input name="defaultPoints" label="النقط" type="number" defaultValue={5} required />
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={saving}>
              إضافة
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
              <div>
                <p className="font-black text-[var(--color-navy)]">{ev.title}</p>
                <p className="text-xs text-slate-500">
                  {ev.isActive ? "مفعّلة" : "معطّلة"} · افتراضي {ev.defaultPoints} طايو
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                  defaultValue={ev.defaultPoints}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v) && v !== ev.defaultPoints) void updatePoints(ev.id, v);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant={ev.isActive ? "secondary" : "primary"}
                  onClick={() => void toggleActive(ev)}
                >
                  {ev.isActive ? "تعطيل" : "تفعيل"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PageShell>
      <StaffBottomNav />
    </>
  );
}
