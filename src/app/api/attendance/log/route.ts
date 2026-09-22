import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession, type SessionPayload } from "@/lib/auth";
import { ATTENDANCE_KIND_LABELS, classifyEvent, isFriday } from "@/lib/attendance";
import { resolveScope } from "@/lib/scope";
import type { Role } from "@/lib/utils";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"];

async function resolveChurchId(session: SessionPayload, requested?: string | null) {
  if (session.role === "SUPER_ADMIN") {
    const churchId = typeof requested === "string" ? requested.trim() : "";
    if (!churchId) return null;
    return (await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } }))?.id ?? null;
  }
  return session.churchId;
}

/**
 * Liturgy (القداس) and Service (الخدمة) attendance logs with exact DD/MM/YYYY dates,
 * scoped to the caller's church / sector / stage.
 */
export async function GET(req: Request) {
  const { session, error } = await requireSession(READ_ROLES);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = await resolveChurchId(session, searchParams.get("churchId"));
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }

  const kind = searchParams.get("kind")?.trim();
  const phaseId = searchParams.get("phaseId")?.trim();
  const classId = searchParams.get("classId")?.trim();
  const q = searchParams.get("q")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const fridayOnly = searchParams.get("fridayOnly") !== "false";
  const limit = Math.min(3000, Math.max(1, Number(searchParams.get("limit") || 1000)));

  if (phaseId && !scope.churchWide && !scope.phaseIds.includes(phaseId)) {
    return jsonError("لا تملك صلاحية على هذه المرحلة", 403);
  }

  const transactions = await prisma.pointTransaction.findMany({
    where: {
      churchId,
      pointsAmount: { gt: 0 },
      student: {
        role: "STUDENT",
        ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }),
        ...(phaseId ? { phaseId } : {}),
        ...(classId ? { classId } : {}),
        ...(q ? { fullName: { contains: q } } : {}),
      },
      createdAt: {
        ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
      },
      OR: [
        { eventType: { title: { contains: "قداس" } } },
        { eventType: { title: { contains: "خدمة" } } },
        { eventType: { title: { contains: "مدارس الأحد" } } },
      ],
    },
    include: {
      eventType: { select: { title: true } },
      student: {
        select: {
          id: true,
          fullName: true,
          phase: { select: { name: true } },
          classRoom: { select: { name: true } },
        },
      },
      servant: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const rows = transactions
    .map((tx) => {
      const attendanceKind = classifyEvent(tx.eventType.title);
      if (!attendanceKind) return null;
      if (kind === "LITURGY" || kind === "SERVICE") {
        if (attendanceKind !== kind) return null;
      }
      const friday = isFriday(tx.createdAt);
      if (fridayOnly && !friday) return null;
      return {
        id: tx.id,
        kind: attendanceKind,
        kindLabel: ATTENDANCE_KIND_LABELS[attendanceKind],
        eventTitle: tx.eventType.title,
        date: tx.createdAt.toLocaleDateString("en-GB"),
        isoDate: tx.createdAt.toISOString().slice(0, 10),
        isFriday: friday,
        pointsAmount: tx.pointsAmount,
        studentId: tx.student.id,
        studentName: tx.student.fullName,
        phaseName: tx.student.phase?.name ?? null,
        className: tx.student.classRoom?.name ?? null,
        servantName: tx.servant.fullName,
        createdAt: tx.createdAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const [phases, classes] = await Promise.all([
    prisma.phase.findMany({
      where: { churchId, ...(scope.churchWide ? {} : { id: { in: scope.phaseIds } }) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, abbreviation: true },
    }),
    prisma.class.findMany({
      where: { churchId, ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phaseId: true },
    }),
  ]);

  return jsonOk({
    rows,
    phases,
    classes,
    summary: {
      liturgy: rows.filter((r) => r.kind === "LITURGY").length,
      service: rows.filter((r) => r.kind === "SERVICE").length,
      students: new Set(rows.map((r) => r.studentId)).size,
      fridays: [...new Set(rows.map((r) => r.date))].sort((a, b) => a.localeCompare(b)),
    },
    me: {
      role: scope.role,
      churchWide: scope.churchWide,
      sector: scope.sector,
      assignedPhaseId: scope.assignedPhaseId,
    },
  });
}
