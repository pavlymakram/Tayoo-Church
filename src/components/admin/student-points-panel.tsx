"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select, TextArea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { fetchJsonWithCache } from "@/lib/offline-db";
import { apiMutate } from "@/lib/offline-mutations";

export type TxRow = {
  id: string;
  pointsAmount: number;
  note: string | null;
  createdAtLabel: string;
  eventTypeId: string;
  eventTitle: string;
  servantName: string;
};

type EventType = { id: string; title: string; defaultPoints: number; isActive: boolean };

export function StudentPointsPanel({
  studentId,
  studentName,
  canManage,
  onBalanceChange,
}: {
  studentId: string;
  studentName: string;
  canManage: boolean;
  onBalanceChange?: (total: number) => void;
}) {
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTx, setEditTx] = useState<TxRow | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editNote, setEditNote] = useState("");
  const [editEventId, setEditEventId] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"delta" | "set">("delta");
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      // Network-First with IndexedDB fallback — the wallet opens offline too.
      const [txHit, evHit] = await Promise.all([
        fetchJsonWithCache<{ transactions: TxRow[]; totalPoints?: number }>(
          `/api/points?studentId=${encodeURIComponent(studentId)}`
        ),
        fetchJsonWithCache<{ events: EventType[] }>("/api/events"),
      ]);
      setTransactions(txHit.data.transactions ?? []);
      setTotalPoints(txHit.data.totalPoints ?? 0);
      onBalanceChange?.(txHit.data.totalPoints ?? 0);
      setEvents(evHit.data.events || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Refresh after the background sync flushes locally saved operations.
  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener("tayoo:offline-synced", onSynced);
    return () => window.removeEventListener("tayoo:offline-synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteTx(id: string) {
    if (!canManage) return;
    if (!window.confirm("هل تريد حذف هذه الحركة وإلغاء النقط المرتبطة بها؟")) return;
    setBusy(true);
    try {
      const out = await apiMutate<{ studentTotalPoints?: number }>(
        `/api/points?id=${encodeURIComponent(id)}`,
        "DELETE"
      );
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (out.queued) {
        toast.info("تم حذف الحركة محلياً — ستتم المزامنة عند عودة الاتصال");
      } else {
        toast.success("تم حذف الحركة");
        setTotalPoints(out.data?.studentTotalPoints ?? totalPoints);
        onBalanceChange?.(out.data?.studentTotalPoints ?? totalPoints);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editTx || !canManage) return;
    setBusy(true);
    try {
      const out = await apiMutate<{ studentTotalPoints?: number }>("/api/points", "PATCH", {
        id: editTx.id,
        pointsAmount: editPoints,
        note: editNote || null,
        eventTypeId: editEventId || undefined,
      });
      if (out.queued) {
        toast.info("تم حفظ التعديل محلياً — ستتم المزامنة عند عودة الاتصال");
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editTx.id
              ? { ...t, pointsAmount: editPoints, note: editNote || null }
              : t
          )
        );
      } else {
        toast.success("تم تعديل الحركة");
        setTotalPoints(out.data?.studentTotalPoints ?? totalPoints);
        onBalanceChange?.(out.data?.studentTotalPoints ?? totalPoints);
      }
      setEditTx(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function applyAdjust() {
    if (!canManage) return;
    setBusy(true);
    try {
      const out = await apiMutate<{ studentTotalPoints?: number }>("/api/points/adjust", "POST", {
        studentId,
        mode: adjustMode,
        value: adjustValue,
        note: adjustNote || null,
      });
      if (out.queued) {
        toast.info("تم حفظ التعديل محلياً — ستتم المزامنة عند عودة الاتصال");
      } else {
        toast.success(`الرصيد الجديد: ${out.data?.studentTotalPoints ?? "?"} طايو`);
        setTotalPoints(out.data?.studentTotalPoints ?? totalPoints);
        onBalanceChange?.(out.data?.studentTotalPoints ?? totalPoints);
      }
      setShowAdjust(false);
      setAdjustNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-navy)] px-4 py-3 text-white">
        <div>
          <p className="text-xs text-slate-300">رصيد {studentName}</p>
          <p className="text-2xl font-black text-[var(--color-gold-soft)]">{totalPoints} طايو</p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="gold"
            size="sm"
            onClick={() => {
              setAdjustMode("set");
              setAdjustValue(totalPoints);
              setShowAdjust(true);
            }}
          >
            <Wallet className="h-4 w-4" />
            تعديل الرصيد
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-500">جارٍ التحميل...</p>
      ) : transactions.length === 0 ? (
        <p className="rounded-2xl bg-white/70 p-4 text-center text-sm text-slate-500">لا توجد حركات</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-[var(--color-ink)]">{t.eventTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t.createdAtLabel} · بواسطة {t.servantName}
                  </p>
                  {t.note && <p className="mt-1 text-xs text-slate-600">{t.note}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-black ${
                    t.pointsAmount >= 0 ? "bg-teal-50 text-teal-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {t.pointsAmount >= 0 ? "+" : ""}
                  {t.pointsAmount}
                </span>
              </div>
              {canManage && (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditTx(t);
                      setEditPoints(t.pointsAmount);
                      setEditNote(t.note || "");
                      setEditEventId(t.eventTypeId);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void deleteTx(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف الحركة / إلغاء
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="تعديل الحركة">
        <div className="space-y-3">
          <Select label="المناسبة" value={editEventId} onChange={(e) => setEditEventId(e.target.value)}>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </Select>
          <Input
            label="قيمة النقط"
            type="number"
            value={editPoints}
            onChange={(e) => setEditPoints(Number(e.target.value))}
            min={-999}
            max={999}
          />
          <TextArea label="ملاحظة" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
          <Button type="button" className="w-full" disabled={busy} onClick={() => void saveEdit()}>
            حفظ التعديل
          </Button>
        </div>
      </Modal>

      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="تعديل الرصيد يدوياً">
        <div className="space-y-3">
          <Select
            label="نوع التعديل"
            value={adjustMode}
            onChange={(e) => setAdjustMode(e.target.value as "delta" | "set")}
          >
            <option value="delta">إضافة / خصم قيمة</option>
            <option value="set">تعيين الرصيد الإجمالي</option>
          </Select>
          <Input
            label={adjustMode === "set" ? "الرصيد المطلوب" : "القيمة (+ أو −)"}
            type="number"
            value={adjustValue}
            onChange={(e) => setAdjustValue(Number(e.target.value))}
          />
          <TextArea
            label="سبب التعديل (اختياري)"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="مثال: تصحيح خطأ مسح مكرر"
          />
          <p className="text-xs text-slate-500">الرصيد الحالي: {totalPoints} طايو</p>
          <Button type="button" className="w-full" disabled={busy} onClick={() => void applyAdjust()}>
            تأكيد التعديل
          </Button>
        </div>
      </Modal>
    </div>
  );
}
