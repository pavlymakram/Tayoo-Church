"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, QrCode, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/shell";
import { Button } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { StudentIdCard } from "@/components/student/id-card";
import { useAuth } from "@/components/providers/auth-provider";

type Tx = {
  id: string;
  pointsAmount: number;
  note: string | null;
  eventTitle: string;
  createdAtLabel: string;
};

export default function StudentHomePage() {
  const { user, church, loading, logout } = useAuth();
  const router = useRouter();
  const [totalPoints, setTotalPoints] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [showId, setShowId] = useState(false);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/student/dashboard");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر التحميل");
      setTotalPoints(data.totalPoints);
      setTransactions(data.transactions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/student");
      return;
    }
    if (user.role !== "STUDENT") {
      router.replace("/");
      return;
    }
    void load();
  }, [user, loading, router, load]);

  if (loading || !user) {
    return (
      <PageShell>
        <div className="py-20 text-center text-slate-500">جارٍ التحميل...</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{church?.name}</p>
          <h1 className="text-2xl font-black text-[var(--color-navy)]">أهلاً، {user.fullName.split(" ")[0]}</h1>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-2xl bg-white p-3 text-slate-500 shadow-sm"
          aria-label="خروج"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] bg-[var(--color-navy)] p-6 text-white shadow-xl"
      >
        <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="absolute -right-6 bottom-0 h-28 w-28 rounded-full bg-amber-400/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-amber-200">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">إجمالي النقط</span>
          </div>
          <p className="mt-3 text-5xl font-black tracking-tight text-[var(--color-gold-soft)]">
            {fetching ? "—" : totalPoints}
          </p>
          <p className="mt-1 text-sm text-slate-300">طايو</p>
        </div>
      </motion.div>

      <motion.button
        type="button"
        onClick={() => setShowId(true)}
        whileTap={{ scale: 0.98 }}
        className="mt-5 flex w-full flex-col items-center gap-3 rounded-[2rem] bg-gradient-to-l from-teal-700 to-teal-600 px-6 py-10 text-white shadow-2xl shadow-teal-900/20"
      >
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white/15">
          <QrCode className="h-9 w-9" />
        </div>
        <span className="text-2xl font-black">الـ ID والباركود بتاعي</span>
        <span className="text-sm text-teal-50/90">اضغط لعرض البطاقة للمسح</span>
      </motion.button>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-black text-[var(--color-navy)]">سجل المعاملات والمواظبة</h2>
        <div className="space-y-3">
          {transactions.length === 0 && !fetching && (
            <div className="glass rounded-3xl p-6 text-center text-slate-500">لا توجد معاملات بعد</div>
          )}
          {transactions.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass flex items-start justify-between gap-3 rounded-3xl p-4"
            >
              <div>
                <p className="font-bold text-[var(--color-ink)]">
                  {t.eventTitle}
                  {t.note ? ` — ${t.note}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">{t.createdAtLabel}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${
                  t.pointsAmount >= 0
                    ? "bg-teal-50 text-teal-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {t.pointsAmount >= 0 ? "+" : ""}
                {t.pointsAmount} طايو
              </span>
            </motion.div>
          ))}
        </div>
      </section>

      <Modal open={showId} onClose={() => setShowId(false)} title="بطاقتي" fullScreen>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 py-4">
          <StudentIdCard
            fullName={user.fullName}
            qrCodeId={user.qrCodeId}
            grade={user.grade}
            churchName={church?.name}
          />
          <Button variant="secondary" onClick={() => setShowId(false)}>
            إغلاق
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}
