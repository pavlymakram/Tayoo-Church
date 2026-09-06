import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

export const GRADES = [
  "1 ابتدائي",
  "2 ابتدائي",
  "3 ابتدائي",
  "4 ابتدائي",
  "5 ابتدائي",
  "6 ابتدائي",
  "1 إعدادي",
  "2 إعدادي",
  "3 إعدادي",
  "1 ثانوي",
  "2 ثانوي",
  "3 ثانوي",
  "جامعي",
  "خريج",
  "أخرى",
] as const;

export const DEFAULT_EVENT_TEMPLATES = [
  { title: "القداس الإلهي", defaultPoints: 5 },
  { title: "حضور الخدمة / مدارس الأحد", defaultPoints: 3 },
  { title: "هدايا وتشجيع", defaultPoints: 0 },
] as const;

export type Role = "STUDENT" | "SERVANT" | "CHURCH_ADMIN" | "SUPER_ADMIN";

export function isStaff(role: string) {
  return role === "SERVANT" || role === "CHURCH_ADMIN" || role === "SUPER_ADMIN";
}

export function isChurchAdmin(role: string) {
  return role === "CHURCH_ADMIN" || role === "SUPER_ADMIN";
}
