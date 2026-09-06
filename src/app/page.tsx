"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ScanLine, Sparkles, Users } from "lucide-react";
import { BrandMark } from "@/components/layout/shell";
import { Button } from "@/components/ui/form";
import { useAuth } from "@/components/providers/auth-provider";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === "STUDENT") router.replace("/student");
    else if (user.role === "SUPER_ADMIN") router.replace("/super-admin");
    else router.replace("/servant");
  }, [user, loading, router]);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[55vh] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(30,58,95,0.95),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(15,118,110,0.55),transparent_40%)]" />
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[var(--color-sand)] to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="pt-6 text-white"
      >
        <div className="rounded-3xl bg-white/10 p-5 backdrop-blur-md ring-1 ring-white/15">
          <BrandMark size="lg" light />
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-100/90">
            منصة الكنيسة لإدارة الحضور، نقاط طايو، ومسح باركود المخدومين — بسيطة وسريعة على الموبايل.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="mt-10 grid gap-4 sm:grid-cols-2"
      >
        <Link
          href="/auth/student"
          className="group glass rounded-[1.75rem] p-6 shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5"
        >
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-[var(--color-emerald)]">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black text-[var(--color-navy)]">المخدوم</h2>
          <p className="mt-2 text-sm text-slate-600">تسجيل ودخول لعرض النقط وبطاقة الـ ID</p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--color-emerald)]">
            ابدأ الآن <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
          </span>
        </Link>

        <Link
          href="/auth/staff"
          className="group glass rounded-[1.75rem] p-6 shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5"
        >
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-[var(--color-gold)]">
            <ScanLine className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black text-[var(--color-navy)]">الخادم / الأدمن</h2>
          <p className="mt-2 text-sm text-slate-600">مسح QR، إضافة نقط، والافتقاد وتصدير Excel</p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--color-gold)]">
            دخول الخدمة <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
          </span>
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-auto pt-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--color-navy)] px-5 py-4 text-white">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-amber-300" />
            تفعيل الكنيسة بمفتاح ترخيص لمرة واحدة
          </div>
          <Link href="/super-admin">
            <Button variant="gold" size="sm">
              بوابة المدير العام
            </Button>
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
