"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell, StaffBottomNav } from "@/components/layout/shell";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { Button, Input, Select, TextArea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/providers/auth-provider";

type Student = {
  id: string;
  fullName: string;
  grade: string | null;
  phone: string;
  totalPoints?: number;
  qrCodeId: string;
};

type EventType = {
  id: string;
  title: string;
  defaultPoints: number;
  isActive: boolean;
};

export default function ScanPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [eventTypeId, setEventTypeId] = useState("");
  const [points, setPoints] = useState(5);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/admin121210");
      return;
    }
    if (!can("scanQr")) {
      router.replace("/servant");
      return;
    }
    void (async () => {
      const res = await fetch("/api/events");
      if (!res.ok) return;
      const data = await res.json();
      const active = (data.events as EventType[]).filter((e) => e.isActive);
      setEvents(active);
      if (active[0]) {
        setEventTypeId(active[0].id);
        setPoints(active[0].defaultPoints || 5);
      }
    })();
  }, [user, loading, router, can]);

  useEffect(() => {
    if (!selected) return;
    const ev = events.find((e) => e.id === eventTypeId);
    if (ev) setPoints(ev.defaultPoints || 1);
  }, [eventTypeId, selected, events]);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/students?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) return;
    const data = await res.json();
    setResults(data.students);
  }

  async function loadByQr(qr: string) {
    const res = await fetch(`/api/students?qr=${encodeURIComponent(qr)}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "لم يتم التعرف على الـ QR");
      return;
    }
    setSelected(data.student);
  }

  async function submitPoints() {
    if (!selected || !eventTypeId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selected.id,
          eventTypeId,
          pointsAmount: points,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      toast.success(
        `تم ${points >= 0 ? "إضافة" : "خصم"} ${Math.abs(points)} طايو لـ ${selected.fullName}`
      );
      setSelected(null);
      setNote("");
      setQuery("");
      setResults([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  const presets = useMemo(() => [1, 5, 10, -5, -15], []);

  return (
    <>
      <PageShell withStaffNav>
        <h1 className="mb-4 text-2xl font-black text-[var(--color-navy)]">مسح وإضافة النقط</h1>

        <div className="glass mb-5 rounded-3xl p-4">
          <QrScanner onScan={(v) => void loadByQr(v)} />
        </div>

        <div className="space-y-3">
          <Input
            label="بحث بالاسم أو رقم التليفون"
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder="اكتب للبحث..."
          />
          <div className="space-y-2">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className="glass flex w-full items-center justify-between rounded-2xl px-4 py-3 text-right"
              >
                <div>
                  <p className="font-bold">{s.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {s.grade} · {s.phone}
                  </p>
                </div>
                <span className="text-sm font-black text-[var(--color-gold)]">
                  {s.totalPoints ?? 0} طايو
                </span>
              </button>
            ))}
          </div>
        </div>
      </PageShell>
      <StaffBottomNav />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? selected.fullName : ""}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {selected.grade || "بدون مرحلة"} · الرصيد:{" "}
              <strong className="text-[var(--color-gold)]">{selected.totalPoints ?? 0}</strong>
            </p>

            <Select
              label="المناسبة"
              value={eventTypeId}
              onChange={(e) => setEventTypeId(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({ev.defaultPoints})
                </option>
              ))}
            </Select>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">النقط</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPoints(p)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      points === p
                        ? "bg-[var(--color-navy)] text-white"
                        : "bg-white border border-slate-200"
                    }`}
                  >
                    {p > 0 ? `+${p}` : p}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                min={-999}
                max={999}
              />
            </div>

            <TextArea
              label="ملاحظة (اختياري)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: حفظ مزمور 23"
            />

            <Button
              type="button"
              className="w-full bg-emerald-700 hover:bg-emerald-800"
              disabled={submitting || !eventTypeId || points === 0}
              onClick={() => void submitPoints()}
            >
              {submitting ? "جارٍ الحفظ..." : "تأكيد وإضافة النقط"}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
