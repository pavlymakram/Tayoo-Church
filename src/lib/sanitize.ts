import { normalizeRole } from "./utils";

type SanitizableUser = {
  id: string;
  churchId: string | null;
  role: string;
  fullName: string;
  phone: string;
  secondaryPhone: string | null;
  address: string | null;
  grade: string | null;
  birthDate: Date | null;
  confessionFather: string | null;
  fatherJob: string | null;
  motherJob: string | null;
  isMotherWorking: boolean;
  qrCodeId: string;
  createdAt: Date;
} & Partial<{
  username: string | null;
  /** Auto-generated initial password; cleared as soon as the owner changes it. */
  initialPassword: string | null;
  phaseId: string | null;
  classId: string | null;
  sector: string | null;
  isFirstAdmin: boolean;
  createdById: string | null;
  email: string | null;
}>;

/** Strips every hash from a user record before it leaves the server. */
export function sanitizeUser(user: SanitizableUser) {
  return {
    id: user.id,
    churchId: user.churchId,
    role: normalizeRole(user.role),
    fullName: user.fullName,
    phone: user.phone,
    secondaryPhone: user.secondaryPhone,
    address: user.address,
    grade: user.grade,
    birthDate: user.birthDate,
    confessionFather: user.confessionFather,
    fatherJob: user.fatherJob,
    motherJob: user.motherJob,
    isMotherWorking: user.isMotherWorking,
    qrCodeId: user.qrCodeId,
    createdAt: user.createdAt,
    username: user.username ?? null,
    initialPassword: user.initialPassword ?? null,
    phaseId: user.phaseId ?? null,
    classId: user.classId ?? null,
    sector: user.sector ?? null,
    isFirstAdmin: user.isFirstAdmin ?? false,
    createdById: user.createdById ?? null,
    email: user.email ?? null,
  };
}

export type SanitizedUser = ReturnType<typeof sanitizeUser>;

