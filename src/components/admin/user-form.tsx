"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input, Select, TextArea } from "@/components/ui/form";
import { GRADES } from "@/lib/utils";

export type ManageableUser = {
  id?: string;
  role: "STUDENT" | "SERVANT" | "CHURCH_ADMIN";
  fullName: string;
  phone: string;
  secondaryPhone?: string | null;
  address?: string | null;
  grade?: string | null;
  birthDate?: string | Date | null;
  confessionFather?: string | null;
  fatherJob?: string | null;
  motherJob?: string | null;
  isMotherWorking?: boolean;
  totalPoints?: number;
};

function toDateInput(value?: string | Date | null) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function UserForm({
  initial,
  canManageStaff,
  mode,
  submitting,
  onSubmit,
}: {
  initial?: ManageableUser | null;
  canManageStaff: boolean;
  mode: "create" | "edit";
  submitting?: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState<ManageableUser["role"]>(initial?.role || "STUDENT");
  const [isMotherWorking, setIsMotherWorking] = useState(!!initial?.isMotherWorking);

  useEffect(() => {
    setRole(initial?.role || "STUDENT");
    setIsMotherWorking(!!initial?.isMotherWorking);
  }, [initial]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await onSubmit({
      ...(initial?.id ? { id: initial.id } : {}),
      role,
      fullName: String(fd.get("fullName") || ""),
      phone: String(fd.get("phone") || ""),
      secondaryPhone: String(fd.get("secondaryPhone") || "") || null,
      address: String(fd.get("address") || "") || null,
      grade: role === "STUDENT" ? String(fd.get("grade") || "") || null : null,
      birthDate: String(fd.get("birthDate") || "") || null,
      confessionFather: String(fd.get("confessionFather") || "") || null,
      fatherJob: String(fd.get("fatherJob") || "") || null,
      isMotherWorking,
      motherJob: isMotherWorking ? String(fd.get("motherJob") || "") || null : null,
      pin: String(fd.get("pin") || "") || null,
      password: String(fd.get("password") || "") || null,
    });
  }

  const roleOptions = canManageStaff
    ? [
        { value: "STUDENT", label: "مخدوم" },
        { value: "SERVANT", label: "خادم" },
        { value: "CHURCH_ADMIN", label: "أدمن كنيسة" },
      ]
    : [{ value: "STUDENT", label: "مخدوم" }];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Select
        label="الدور"
        value={role}
        onChange={(e) => setRole(e.target.value as ManageableUser["role"])}
        disabled={!canManageStaff && mode === "edit" && initial?.role !== "STUDENT"}
      >
        {roleOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <Input name="fullName" label="الاسم الرباعي" required defaultValue={initial?.fullName || ""} />
      <Input
        name="phone"
        label="رقم التليفون"
        required
        inputMode="tel"
        defaultValue={initial?.phone || ""}
      />
      <Input
        name="secondaryPhone"
        label="رقم تليفون إضافي / ولي الأمر"
        inputMode="tel"
        defaultValue={initial?.secondaryPhone || ""}
      />
      <TextArea name="address" label="العنوان" defaultValue={initial?.address || ""} />

      {role === "STUDENT" && (
        <>
          <Select name="grade" label="المرحلة الدراسية" defaultValue={initial?.grade || "1 إعدادي"}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Input
            name="birthDate"
            label="تاريخ الميلاد"
            type="date"
            defaultValue={toDateInput(initial?.birthDate)}
          />
          <Input
            name="confessionFather"
            label="أب الاعتراف"
            defaultValue={initial?.confessionFather || ""}
          />
          <Input name="fatherJob" label="وظيفة الأب" defaultValue={initial?.fatherJob || ""} />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={isMotherWorking}
              onChange={(e) => setIsMotherWorking(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-emerald)]"
            />
            <span className="text-sm font-semibold">هل الأم تعمل؟</span>
          </label>
          {isMotherWorking && (
            <Input name="motherJob" label="وظيفة الأم" defaultValue={initial?.motherJob || ""} />
          )}
          <Input
            name="pin"
            label={mode === "create" ? "الرقم السري (PIN)" : "تغيير PIN (اختياري)"}
            type="password"
            minLength={4}
            maxLength={8}
            required={mode === "create"}
          />
        </>
      )}

      {role !== "STUDENT" && (
        <Input
          name="password"
          label={mode === "create" ? "كلمة المرور" : "تغيير كلمة المرور (اختياري)"}
          type="password"
          minLength={6}
          required={mode === "create"}
        />
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "جارٍ الحفظ..." : mode === "create" ? "إضافة المستخدم" : "حفظ التعديلات"}
      </Button>
    </form>
  );
}
