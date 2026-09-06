"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

export function StudentIdCard({
  fullName,
  qrCodeId,
  grade,
  churchName,
}: {
  fullName: string;
  qrCodeId: string;
  grade?: string | null;
  churchName?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] bg-[var(--color-navy)] text-white shadow-2xl shadow-slate-900/30"
    >
      <div className="bg-gradient-to-l from-teal-600/40 via-transparent to-amber-400/20 px-6 pt-6 pb-4">
        <p className="text-sm font-semibold text-amber-200">طايو — بطاقة المخدوم</p>
        {churchName && <p className="mt-1 text-xs text-slate-300">{churchName}</p>}
        <h3 className="mt-4 text-2xl font-black leading-snug">{fullName}</h3>
        {grade && <p className="mt-1 text-sm text-teal-100">{grade}</p>}
      </div>
      <div className="flex flex-col items-center gap-4 bg-white px-6 py-7 text-[var(--color-ink)]">
        <div className="rounded-3xl border-4 border-[var(--color-gold-soft)] bg-white p-3 shadow-inner">
          <QRCodeSVG value={qrCodeId} size={220} level="H" includeMargin />
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">رقم الهوية</p>
          <p className="mt-1 font-mono text-sm font-bold tracking-wider text-[var(--color-navy)] break-all">
            {qrCodeId}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
