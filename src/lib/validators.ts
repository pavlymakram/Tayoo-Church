import { z } from "zod";

export const studentRegisterSchema = z.object({
  churchLicenseKey: z.string().min(4, "مفتاح الترخيص مطلوب"),
  fullName: z.string().min(3, "الاسم الرباعي مطلوب"),
  address: z.string().min(3, "العنوان مطلوب"),
  grade: z.string().min(1, "المرحلة الدراسية مطلوبة"),
  phone: z.string().min(8, "رقم التليفون مطلوب"),
  secondaryPhone: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  confessionFather: z.string().optional().nullable(),
  fatherJob: z.string().optional().nullable(),
  isMotherWorking: z.boolean().optional().default(false),
  motherJob: z.string().optional().nullable(),
  pin: z.string().min(4, "الرقم السري يجب ألا يقل عن 4 أرقام").max(8),
});

export const studentLoginSchema = z.object({
  churchLicenseKey: z.string().optional(),
  phone: z.string().optional(),
  fullName: z.string().optional(),
  pin: z.string().min(4, "الرقم السري مطلوب"),
}).refine((d) => d.phone || d.fullName, {
  message: "أدخل رقم التليفون أو الاسم",
});

export const staffLoginSchema = z.object({
  phone: z.string().min(8, "رقم التليفون مطلوب"),
  password: z.string().min(4, "كلمة المرور مطلوبة"),
});

export const createChurchSchema = z.object({
  name: z.string().min(2, "اسم الكنيسة مطلوب"),
  adminFullName: z.string().min(3, "اسم الأدمن مطلوب"),
  adminPhone: z.string().min(8, "رقم تليفون الأدمن مطلوب"),
  adminPassword: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
});

export const eventTypeSchema = z.object({
  title: z.string().min(2, "عنوان المناسبة مطلوب"),
  defaultPoints: z.number().int().min(-999).max(999),
  isActive: z.boolean().optional().default(true),
});

export const pointTransactionSchema = z.object({
  studentId: z.string().uuid("معرف المخدوم غير صحيح").or(z.string().min(1)),
  eventTypeId: z.string().min(1, "اختر المناسبة"),
  pointsAmount: z.number().int().min(-999).max(999),
  note: z.string().optional().nullable(),
});

export const createServantSchema = z.object({
  fullName: z.string().min(3),
  phone: z.string().min(8),
  password: z.string().min(6),
  role: z.enum(["SERVANT", "CHURCH_ADMIN"]).default("SERVANT"),
});
