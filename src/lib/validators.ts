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

/** The universal login accepts student PIN/birth date or a staff password/security code. */
export const universalLoginSchema = z.object({
  identifier: z.string().min(3, "أدخل رقم الهاتف أو البريد الإلكتروني"),
  secret: z.string().min(4, "أدخل كلمة المرور أو PIN أو كود الدور"),
  studentMethod: z.enum(["PIN", "BIRTH_DATE"]).optional().default("PIN"),
});

export const churchSettingsSchema = z.object({
  defaultMassPoints: z.number().int().min(-999).max(999),
  defaultServicePoints: z.number().int().min(-999).max(999),
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
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  securityCode: z.string().min(4).max(64).optional().or(z.literal("")),
  role: z.enum(["SERVANT", "CHURCH_ADMIN"]).default("SERVANT"),
});

export const adminUserUpsertSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["STUDENT", "SERVANT", "CHURCH_ADMIN"]),
  fullName: z.string().min(3, "الاسم مطلوب"),
  phone: z.string().min(8, "رقم التليفون مطلوب"),
  secondaryPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  confessionFather: z.string().optional().nullable(),
  fatherJob: z.string().optional().nullable(),
  motherJob: z.string().optional().nullable(),
  isMotherWorking: z.boolean().optional().default(false),
  pin: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || (v.length >= 4 && v.length <= 8), {
      message: "الرقم السري يجب أن يكون من 4 إلى 8 أرقام",
    }),
  password: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || v.length >= 6, {
      message: "كلمة المرور يجب ألا تقل عن 6 أحرف",
    }),
});

export const updatePointTransactionSchema = z.object({
  id: z.string().min(1, "معرف الحركة مطلوب"),
  pointsAmount: z.number().int().min(-999).max(999).optional(),
  note: z.string().optional().nullable(),
  eventTypeId: z.string().optional(),
});

export const adjustBalanceSchema = z.object({
  studentId: z.string().min(1, "معرف المخدوم مطلوب"),
  mode: z.enum(["set", "delta"]).default("delta"),
  /** Absolute target balance when mode=set, or delta when mode=delta */
  value: z.number().int().min(-99999).max(99999),
  note: z.string().optional().nullable(),
});
