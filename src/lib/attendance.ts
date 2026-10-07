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

/** Liturgy (القداس) registration closes sharply at 08:00 Cairo time (EEST). */
export const LITURGY_CUTOFF_HOUR = 8;
export const LITURGY_CUTOFF_MINUTES = LITURGY_CUTOFF_HOUR * 60;
export const LITURGY_CUTOFF_MESSAGE =
  "عفواً، انتهى موعد تسجيل حضور القداس (الساعة 8:00 صباحاً)";

function cairoParts(date: Date): { hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Minutes elapsed since midnight in Cairo (Africa/Cairo). */
export function cairoMinutesSinceMidnight(date: Date = new Date()): number {
  const { hour, minute } = cairoParts(date);
  return hour * 60 + minute;
}

/** `true` while Liturgy scanning is still permitted (strictly up to 08:00). */
export function isLiturgyScanOpen(now: Date = new Date()): boolean {
  const { hour, minute, second } = cairoParts(now);
  const totalSeconds = hour * 3600 + minute * 60 + second;
  return totalSeconds <= LITURGY_CUTOFF_MINUTES * 60;
}

export function liturgyCutoffState(now: Date = new Date()): { open: boolean; message: string | null } {
  const open = isLiturgyScanOpen(now);
  return { open, message: open ? null : LITURGY_CUTOFF_MESSAGE };
}

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
