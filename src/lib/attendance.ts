/**
 * Attendance (الحضور) helpers.
 *
 * Every scan writes a PointTransaction against an EventType. Attendance logs are
 * therefore derived from transactions whose event title classifies as Liturgy
 * (القداس) or Service (الخدمة / مدارس الأحد), keeping one single source of truth
 * for scanning and reporting.
 */

export type AttendanceKind = "LITURGY" | "SERVICE";

export const ATTENDANCE_KIND_LABELS: Record<AttendanceKind, string> = {
  LITURGY: "القداس",
  SERVICE: "الخدمة",
};

export const LITURGY_EVENT_TITLE = "القداس الإلهي";
export const SERVICE_EVENT_TITLE = "حضور الخدمة / مدارس الأحد";

export function classifyEvent(title: string | null | undefined): AttendanceKind | null {
  if (!title) return null;
  if (title.includes("قداس")) return "LITURGY";
  if (title.includes("خدمة") || title.includes("مدارس الأحد")) return "SERVICE";
  return null;
}

export function isLiturgyEvent(title: string | null | undefined): boolean {
  return classifyEvent(title) === "LITURGY";
}

export function isServiceEvent(title: string | null | undefined): boolean {
  return classifyEvent(title) === "SERVICE";
}

/** Exact report date format required by the platform: DD/MM/YYYY. */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Friday is the church attendance day (liturgy + service). */
export function isFriday(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return !Number.isNaN(d.getTime()) && d.getDay() === 5;
}

/** Unique, ascending list of attendance dates formatted DD/MM/YYYY. */
export function uniqueDateLabels(dates: (Date | string)[]): string[] {
  const formatted = new Set<string>();
  for (const date of dates) {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) continue;
    formatted.add(`${d.getTime()}:${formatShortDate(d)}`);
  }
  return [...formatted]
    .sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]))
    .map((entry) => entry.split(":")[1]);
}
