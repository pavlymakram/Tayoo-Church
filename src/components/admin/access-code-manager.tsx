"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Select } from "@/components/ui/form";

type Code = { id: string; code: string; role: string; userName: string; churchName?: string; usageCount: number; maxUses: number | null; expiresAt: string | null; isActive: boolean };
type Church = { id: string; name: string };

export function AccessCodeManager({ superAdmin = false, churches = [] }: { superAdmin?: boolean; churches?: Church[] }) {
  const [codes, setCodes] = useState<Code[]>([]); const [busy, setBusy] = useState(false);
  const load = async () => { const r = await fetch("/api/access-codes"); if (r.ok) setCodes((await r.json()).codes); };
  useEffect(() => { void load(); }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget);
    const payload = { code: f.get("code"), password: f.get("password"), displayName: f.get("displayName"), role: superAdmin ? "CHURCH_ADMIN" : "SERVANT", churchId: superAdmin ? f.get("churchId") : undefined, maxUses: f.get("maxUses") ? Number(f.get("maxUses")) : undefined, expiresAt: f.get("expiresAt") || undefined };
    const r = await fetch("/api/access-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await r.json();
    if (!r.ok) toast.error(data.error || "تعذر إنشاء الكود"); else { toast.success(`تم إنشاء ${data.code.code}`); e.currentTarget.reset(); await load(); } setBusy(false);
  }
  async function toggle(code: Code) { const r = await fetch("/api/access-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: code.id, isActive: !code.isActive }) }); if (r.ok) await load(); else toast.error("تعذر تحديث الكود"); }
  return <section className="glass mb-6 rounded-3xl p-5"><h2 className="mb-4 text-lg font-black text-[var(--color-navy)]">إدارة أكواد الوصول</h2>
    <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
      {superAdmin && <Select name="churchId" label="الكنيسة" required defaultValue=""><option value="" disabled>اختر كنيسة</option>{churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      <Input name="displayName" label="اسم صاحب الكود" required />
      <Input name="code" label={superAdmin ? "كود أدمن الكنيسة" : "كود الخادم"} placeholder={superAdmin ? "CH-MARGIRGIS-99" : "SERV-102"} required />
      <Input name="password" label="كلمة مرور الكود" type="password" minLength={4} required />
      <Input name="maxUses" label="الحد الأقصى للاستخدام (اختياري)" type="number" min={1} />
      <Input name="expiresAt" label="تاريخ الانتهاء (اختياري)" type="date" />
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "جارٍ الإنشاء..." : "إنشاء كود دخول"}</Button></div>
    </form>
    <div className="mt-5 space-y-2">{codes.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3"><div><p className="font-mono font-bold text-[var(--color-navy)]">{c.code}</p><p className="text-xs text-slate-500">{c.userName}{c.churchName ? ` · ${c.churchName}` : ""} · {c.usageCount}{c.maxUses ? `/${c.maxUses}` : ""}</p></div><Button size="sm" variant={c.isActive ? "danger" : "primary"} onClick={() => void toggle(c)}>{c.isActive ? "إيقاف" : "تفعيل"}</Button></div>)}{!codes.length && <p className="text-sm text-slate-500">لا توجد أكواد وصول بعد.</p>}</div>
  </section>;
}
