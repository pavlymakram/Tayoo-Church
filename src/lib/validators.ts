import { z } from "zod";
import { ABBREVIATION_PATTERN, normalizeAbbreviation } from "./credentials";
import { SECTORS } from "./phases";

const SECTOR_KEYS = SECTORS.map((s) => s.key) as [string, ...string[]];

/** English abbreviation codes: `mar_girgis`, `prep1`, `sec2` … */
export const abbreviationField = (label: string) =>
  z
    .string()
    .min(2, `${label} مطلوب`)
    .max(30, `${label} طويل جداً`)
    .transform(normalizeAbbreviation)
    .refine((value) => ABBREVIATION_PATTERN.test(value), {
      message: `${label} يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط`,
    });


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

/** Staff sign in with the auto-generated username (or phone) + password. */
export const staffLoginSchema = z
  .object({
    identifier: z.string().min(3).optional(),
    phone: z.string().min(8).optional(),
    password: z.string().min(4, "كلمة المرور مطلوبة"),
  })
  .refine((d) => d.identifier || d.phone, {
    message: "أدخل اسم المستخدم أو رقم التليفون",
  });

export const createChurchSchema = z.object({
  name: z.string().min(2, "اسم الكنيسة مطلوب"),
  abbreviation: abbreviationField("كود الكنيسة بالإنجليزية"),
  adminFullName: z.string().min(3, "اسم أدمن الكنيسة مطلوب"),
  adminPhone: z.string().min(8, "رقم تليفون الأدمن مطلوب"),
});

export const updateChurchSchema = z.object({
  id: z.string().min(1, "معرف الكنيسة مطلوب"),
  name: z.string().min(2).optional(),
  abbreviation: abbreviationField("كود الكنيسة بالإنجليزية").optional(),
  isActive: z.boolean().optional(),
  regenerateLicense: z.boolean().optional(),
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

/** Church admins, phase admins and phase servants share one credential pipeline. */
export const staffUpsertSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]),
  fullName: z.string().min(3, "الاسم مطلوب"),
  phone: z.string().min(8, "رقم التليفون مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional().nullable().or(z.literal("")),
  secondaryPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  /** Required for PHASE_ADMIN — the sector (قطاع) they manage. */
  sector: z.enum(SECTOR_KEYS).optional().nullable(),
  /** Required for PHASE_SERVANT — the single stage they serve. */
  phaseId: z.string().optional().nullable(),
  /** Optional class/fasl assignment for servants. */
  classId: z.string().optional().nullable(),
  /** Re-issues the auto-generated initial password on update. */
  regenerateCredentials: z.boolean().optional().default(false),
});

export const studentUpsertSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().min(3, "الاسم مطلوب"),
  phone: z.string().min(8, "رقم التليفون مطلوب"),
  secondaryPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  phaseId: z.string().optional().nullable(),
  classId: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  confessionFather: z.string().optional().nullable(),
  fatherJob: z.string().optional().nullable(),
  motherJob: z.string().optional().nullable(),
  isMotherWorking: z.boolean().optional().default(false),
  /** Optional PIN kept for legacy PIN login; username/password always exist. */
  pin: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || (v.length >= 4 && v.length <= 8), {
      message: "الرقم السري يجب أن يكون من 4 إلى 8 أرقام",
    }),
  regenerateCredentials: z.boolean().optional().default(false),
});

export const phaseUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "اسم المرحلة مطلوب"),
  abbreviation: abbreviationField("كود المرحلة بالإنجليزية"),
  sector: z.enum(SECTOR_KEYS),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const classUpsertSchema = z.object({
  id: z.string().optional(),
  phaseId: z.string().min(1, "اختر المرحلة"),
  name: z.string().min(1, "اسم الفصل مطلوب"),
});

/** Profile settings: owners rotate their own password (or PIN for students). */
export const changeSecretSchema = z.object({
  currentSecret: z.string().min(4, "أدخل كلمة المرور الحالية"),
  newSecret: z.string().min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف").max(72),
});

export const changePinSchema = z.object({
  currentPin: z.string().min(4, "أدخل الرقم السري الحالي"),
  newPin: z.string().min(4, "الرقم السري الجديد من 4 إلى 8 أرقام").max(8),
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
