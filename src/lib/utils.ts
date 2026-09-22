import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_PHASES } from "./phases";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calcAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function formatArabicDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Stage labels follow the dynamic phase catalogue, with a free-text fallback. */
export const GRADES = [...DEFAULT_PHASES.map((p) => p.name), "أخرى"] as const;

export const DEFAULT_EVENT_TEMPLATES = [
  { title: "القداس الإلهي", defaultPoints: 5 },
  { title: "حضور الخدمة / مدارس الأحد", defaultPoints: 3 },
  { title: "هدايا وتشجيع", defaultPoints: 0 },
] as const;

/**
 * Five platform roles:
 * SUPER_ADMIN → CHURCH_ADMIN → PHASE_ADMIN → PHASE_SERVANT → STUDENT (المخدوم).
 */
export type Role =
  | "STUDENT"
  | "PHASE_SERVANT"
  | "PHASE_ADMIN"
  | "CHURCH_ADMIN"
  | "SUPER_ADMIN";

export const STAFF_ROLES: readonly Role[] = [
  "PHASE_SERVANT",
  "PHASE_ADMIN",
  "CHURCH_ADMIN",
  "SUPER_ADMIN",
] as const;

export const ALL_ROLES: readonly Role[] = [
  "STUDENT",
  "PHASE_SERVANT",
  "PHASE_ADMIN",
  "CHURCH_ADMIN",
  "SUPER_ADMIN",
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: "مخدوم",
  PHASE_SERVANT: "خادم مرحلة",
  PHASE_ADMIN: "أدمن قطاع",
  CHURCH_ADMIN: "أدمن كنيسة",
  SUPER_ADMIN: "مدير النظام",
};

/** Legacy databases stored servants as `SERVANT`; map them forward transparently. */
export function normalizeRole(role: string | null | undefined): Role {
  if (role === "SERVANT") return "PHASE_SERVANT";
  if (
    role === "STUDENT" ||
    role === "PHASE_SERVANT" ||
    role === "PHASE_ADMIN" ||
    role === "CHURCH_ADMIN" ||
    role === "SUPER_ADMIN"
  ) {
    return role;
  }
  return "STUDENT";
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[normalizeRole(role)];
}

export function isStaff(role: string | null | undefined) {
  return STAFF_ROLES.includes(normalizeRole(role));
}

export function isChurchAdmin(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return normalized === "CHURCH_ADMIN" || normalized === "SUPER_ADMIN";
}

/** Home route for each role after authentication. */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/student/dashboard",
  PHASE_SERVANT: "/servant/quick-scan",
  PHASE_ADMIN: "/servant",
  CHURCH_ADMIN: "/admin/dashboard",
  SUPER_ADMIN: "/super-admin/tenants",
};

