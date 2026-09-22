import { normalizeRole, type Role } from "./utils";

/**
 * Single source of truth for the role hierarchy.
 *
 * SUPER_ADMIN   → global creator: churches, global settings, everything.
 * CHURCH_ADMIN  → one church only. Creates/manages phase admins & phase servants,
 *                 manages settings/classes/students inside the church, exports the
 *                 full church workbook. Never creates students/classes nor scans QR.
 * PHASE_ADMIN   → one sector (e.g. Preparatory 1-3): servants, students, classes,
 *                 QR scanning, sector reports and attendance logs.
 * PHASE_SERVANT → one single stage (e.g. 1st Preparatory): creates students, scans,
 *                 exports only that stage, views its attendance logs.
 * STUDENT       → personal dashboard only (QR, points, attendance history).
 */
export type Capability =
  | "manageChurches"
  | "manageChurchSettings"
  | "manageChurchAdmins"
  | "managePhaseAdmins"
  | "managePhaseServants"
  | "createStudents"
  | "manageStudents"
  | "createClasses"
  | "manageClasses"
  | "scanQr"
  | "manageEvents"
  | "viewAttendanceLogs"
  | "exportChurchReport"
  | "exportSectorReport"
  | "exportPhaseReport";

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  SUPER_ADMIN: [
    "manageChurches",
    "manageChurchSettings",
    "manageChurchAdmins",
    "managePhaseAdmins",
    "managePhaseServants",
    "createStudents",
    "manageStudents",
    "createClasses",
    "manageClasses",
    "scanQr",
    "manageEvents",
    "viewAttendanceLogs",
    "exportChurchReport",
    "exportSectorReport",
    "exportPhaseReport",
  ],
  CHURCH_ADMIN: [
    "manageChurchSettings",
    "manageChurchAdmins",
    "managePhaseAdmins",
    "managePhaseServants",
    // Church admins curate the church structure; students and classes are created by
    // phase admins, while church admins may still edit/delete/relocate them.
    "manageStudents",
    "manageClasses",
    "manageEvents",
    "viewAttendanceLogs",
    "exportChurchReport",
  ],
  PHASE_ADMIN: [
    "managePhaseServants",
    "createStudents",
    "manageStudents",
    "createClasses",
    "manageClasses",
    "scanQr",
    "viewAttendanceLogs",
    "exportSectorReport",
  ],
  PHASE_SERVANT: [
    "createStudents",
    "manageStudents",
    "scanQr",
    "viewAttendanceLogs",
    "exportPhaseReport",
  ],
  STUDENT: [],
};

export function can(role: string | null | undefined, capability: Capability): boolean {
  return CAPABILITIES[normalizeRole(role)].includes(capability);
}

export function capabilitiesFor(role: string | null | undefined): readonly Capability[] {
  return CAPABILITIES[normalizeRole(role)];
}

/** The Excel/attendance-log scope granted to a role. */
export type ReportScope = "church" | "sector" | "phase" | "none";

export function reportScopeFor(role: string | null | undefined): ReportScope {
  switch (normalizeRole(role)) {
    case "SUPER_ADMIN":
    case "CHURCH_ADMIN":
      return "church";
    case "PHASE_ADMIN":
      return "sector";
    case "PHASE_SERVANT":
      return "phase";
    default:
      return "none";
  }
}
