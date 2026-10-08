import { classifyEvent, isFriday, isLiturgyEvent, isServiceEvent } from "./attendance";
import { prisma } from "./prisma";
import { sectorLabel } from "./phases";
import { reportScopeFor, type ReportScope } from "./permissions";
import { calcAge, normalizeRole, roleLabel } from "./utils";
import type { AccessScope } from "./scope";

/** Rows consumed by the Excel engine. */
export type ExportPerson = {
  id: string;
  fullName: string;
  username: string | null;
  /** Auto-generated initial password/PIN for easy distribution. */
  initialPassword: string | null;
  role: string;
  roleLabel: string;
  className: string | null;
  phone: string;
  secondaryPhone: string | null;
  address: string | null;
  grade: string | null;
  age: number | null;
  confessionFather: string | null;
  fatherJob: string | null;
  motherJob: string | null;
  isMotherWorking: boolean;
  totalPoints: number;
  /** Friday attendance dates, DD/MM/YYYY. */
  liturgyDates: string[];
  serviceDates: string[];
  /** All-time attendance counts (including non-Friday occasions). */
  liturgyTotal: number;
  serviceTotal: number;
};

export type ExportClassGroup = { name: string; members: ExportPerson[] };

export type ExportSection = {
  phaseId: string;
  name: string;
  abbreviation: string;
  sector: string;
  sectorName: string;
  sortOrder: number;
  classes: ExportClassGroup[];
  unassigned: ExportPerson[];
  servantCount: number;
  studentCount: number;
};

export type ExportPayload = {
  church: { id: string; name: string; abbreviation: string; licenseKey: string };
  scope: ReportScope;
  scopeLabel: string;
  sections: ExportSection[];
  /** Every Friday with attendance across the exported scope. */
  fridays: string[];
  generatedAt: Date;
};

function sortPeople(list: ExportPerson[]) {
  const order: Record<string, number> = { PHASE_ADMIN: 0, PHASE_SERVANT: 1, CHURCH_ADMIN: 2, STUDENT: 3 };
  return [...list].sort((a, b) => {
    const byRole = (order[a.role] ?? 9) - (order[b.role] ?? 9);
    if (byRole !== 0) return byRole;
    return a.fullName.localeCompare(b.fullName, "ar");
  });
}

export function attendanceKindOf(title: string) {
  if (isLiturgyEvent(title)) return "LITURGY" as const;
  if (isServiceEvent(title)) return "SERVICE" as const;
  return null;
}

/**
 * Collects every phase, class, servant, student and Friday attendance log inside the
 * caller's scope and lays it out in the order required by the report engine
 * (KG1 → Graduates for church admins, one sector/stage for everyone else).
 */
export async function buildExportPayload(churchId: string, scope: AccessScope): Promise<ExportPayload | null> {
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return null;

  const phases = await prisma.phase.findMany({
    where: { churchId, ...(scope.churchWide ? {} : { id: { in: scope.phaseIds } }) },
    orderBy: { sortOrder: "asc" },
  });

  const phaseIds = phases.map((p) => p.id);
  const classes = await prisma.class.findMany({
    where: { churchId, phaseId: { in: phaseIds } },
    orderBy: { name: "asc" },
  });

  const members = await prisma.user.findMany({
    where: {
      churchId,
      role: { in: ["STUDENT", "PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN"] },
      ...(scope.churchWide ? {} : { phaseId: { in: phaseIds } }),
    },
    orderBy: { fullName: "asc" },
  });

  const studentIds = members.filter((m) => m.role === "STUDENT").map((m) => m.id);
  const transactions = studentIds.length
    ? await prisma.pointTransaction.findMany({
        where: { churchId, studentId: { in: studentIds } },
        include: { eventType: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const points = new Map<string, number>();
  const liturgy = new Map<string, { dates: Set<string>; total: number }>();
  const service = new Map<string, { dates: Set<string>; total: number }>();
  const fridays = new Set<string>();

  for (const tx of transactions) {
    points.set(tx.studentId, (points.get(tx.studentId) ?? 0) + tx.pointsAmount);
    const kind = classifyEvent(tx.eventType.title);
    if (!kind || tx.pointsAmount <= 0) continue;
    const bucket = kind === "LITURGY" ? liturgy : service;
    const entry = bucket.get(tx.studentId) ?? { dates: new Set<string>(), total: 0 };
    entry.total += 1;
    if (isFriday(tx.createdAt)) {
      const label = new Date(tx.createdAt).toLocaleDateString("en-GB");
      entry.dates.add(label);
      fridays.add(label);
    }
    bucket.set(tx.studentId, entry);
  }

  const classById = new Map(classes.map((c) => [c.id, c]));
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  const sortDates = (set?: Set<string>) => [...(set ?? [])].sort((a, b) => a.localeCompare(b));

  const toPerson = (member: (typeof members)[number]): ExportPerson => ({
    id: member.id,
    fullName: member.fullName,
    username: member.username,
    initialPassword: member.initialPassword,
    role: normalizeRole(member.role),
    roleLabel: roleLabel(member.role),
    className: member.classId ? classById.get(member.classId)?.name ?? null : null,
    phone: member.phone,
    secondaryPhone: member.secondaryPhone,
    address: member.address,
    grade: member.grade,
    age: calcAge(member.birthDate),
    confessionFather: member.confessionFather,
    fatherJob: member.fatherJob,
    motherJob: member.motherJob,
    isMotherWorking: member.isMotherWorking,
    totalPoints: member.role === "STUDENT" ? points.get(member.id) ?? 0 : 0,
    liturgyDates: sortDates(liturgy.get(member.id)?.dates),
    serviceDates: sortDates(service.get(member.id)?.dates),
    liturgyTotal: liturgy.get(member.id)?.total ?? 0,
    serviceTotal: service.get(member.id)?.total ?? 0,
  });

  const sections: ExportSection[] = [];

  for (const phase of phases) {
    // Phase admins of a sector also surface inside every stage sheet of that sector so
    // the report is never missing the servants who run it.
    const phaseMembers = members.filter(
      (m) => m.phaseId === phase.id || (m.role === "PHASE_ADMIN" && m.sector === phase.sector)
    );
    const phaseClasses = classes.filter((c) => c.phaseId === phase.id);
    const classIds = new Set(phaseClasses.map((c) => c.id));

    sections.push({
      phaseId: phase.id,
      name: phase.name,
      abbreviation: phase.abbreviation,
      sector: phase.sector,
      sectorName: sectorLabel(phase.sector),
      sortOrder: phase.sortOrder,
      classes: phaseClasses.map((item) => ({
        name: item.name,
        members: sortPeople(phaseMembers.filter((m) => m.classId === item.id).map(toPerson)),
      })),
      unassigned: sortPeople(
        phaseMembers.filter((m) => !m.classId || !classIds.has(m.classId)).map(toPerson)
      ),
      servantCount: phaseMembers.filter((m) => m.role !== "STUDENT").length,
      studentCount: phaseMembers.filter((m) => m.role === "STUDENT").length,
    });
  }

  const reportScope = reportScopeFor(scope.role);
  const scopeLabel =
    reportScope === "church"
      ? "كل الكنيسة (جميع المراحل)"
      : reportScope === "sector"
        ? `قطاع ${sectorLabel(scope.sector)}`
        : phaseById.get(scope.assignedPhaseId ?? "")?.name ?? "مرحلة واحدة";

  return {
    church: {
      id: church.id,
      name: church.name,
      abbreviation: church.abbreviation,
      licenseKey: church.licenseKey,
    },
    scope: reportScope,
    scopeLabel,
    sections,
    fridays: sortDates(fridays),
    generatedAt: new Date(),
  };
}

