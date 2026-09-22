import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { resolveScope } from "@/lib/scope";

/** Role-scoped dashboard analytics for the church, sector or single stage. */
export async function GET() {
  const { session, error } = await requireSession([
    "SUPER_ADMIN",
    "CHURCH_ADMIN",
    "PHASE_ADMIN",
    "PHASE_SERVANT",
  ]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const churchId = session.churchId;
  const scope = await resolveScope(session);
  const scopeFilter = scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } };

  const [totalStudents, pointsAgg, recent, attendanceRows, classes] = await Promise.all([
    prisma.user.count({ where: { churchId, role: "STUDENT", ...scopeFilter } }),
    prisma.pointTransaction.aggregate({
      where: { churchId, student: { ...scopeFilter } },
      _sum: { pointsAmount: true },
      _count: true,
    }),
    prisma.pointTransaction.findMany({
      where: { churchId, student: { ...scopeFilter } },
      include: {
        student: { select: { fullName: true, grade: true } },
        eventType: { select: { title: true } },
        servant: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.pointTransaction.findMany({
      where: {
        churchId,
        pointsAmount: { gt: 0 },
        student: { ...scopeFilter },
        OR: [
          { eventType: { title: { contains: "قداس" } } },
          { eventType: { title: { contains: "خدمة" } } },
          { eventType: { title: { contains: "مدارس الأحد" } } },
        ],
      },
      select: { createdAt: true, eventType: { select: { title: true } } },
    }),
    prisma.class.count({
      where: { churchId, ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }) },
    }),
  ]);

  const liturgyCount = attendanceRows.filter((t) => t.eventType.title.includes("قداس")).length;
  const serviceCount = attendanceRows.length - liturgyCount;

  return jsonOk({
    stats: {
      totalStudents,
      totalPointsIssued: pointsAgg._sum.pointsAmount ?? 0,
      totalTransactions: pointsAgg._count,
      massAttendances: liturgyCount,
      serviceAttendances: serviceCount,
      classCount: classes,
    },
    scope: {
      role: scope.role,
      churchWide: scope.churchWide,
      sector: scope.sector,
      phaseIds: scope.phaseIds,
      unassigned: scope.unassigned,
    },
    recent: recent.map((r) => ({
      id: r.id,
      pointsAmount: r.pointsAmount,
      note: r.note,
      createdAt: r.createdAt,
      studentName: r.student.fullName,
      studentGrade: r.student.grade,
      eventTitle: r.eventType.title,
      servantName: r.servant.fullName,
    })),
  });
}
