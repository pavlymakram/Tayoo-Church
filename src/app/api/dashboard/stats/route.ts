import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";

export async function GET() {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const churchId = session.churchId;

  const [totalStudents, pointsAgg, massEvent, recent] = await Promise.all([
    prisma.user.count({ where: { churchId, role: "STUDENT" } }),
    prisma.pointTransaction.aggregate({
      where: { churchId },
      _sum: { pointsAmount: true },
      _count: true,
    }),
    prisma.eventType.findFirst({
      where: { churchId, title: { contains: "قداس" } },
    }),
    prisma.pointTransaction.findMany({
      where: { churchId },
      include: {
        student: { select: { fullName: true, grade: true } },
        eventType: { select: { title: true } },
        servant: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  let massAttendances = 0;
  if (massEvent) {
    massAttendances = await prisma.pointTransaction.count({
      where: { churchId, eventTypeId: massEvent.id, pointsAmount: { gt: 0 } },
    });
  }

  return jsonOk({
    stats: {
      totalStudents,
      totalPointsIssued: pointsAgg._sum.pointsAmount ?? 0,
      totalTransactions: pointsAgg._count,
      massAttendances,
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
