import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { formatArabicDate } from "@/lib/utils";

export async function GET() {
  const { session, error } = await requireSession(["STUDENT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const user = await prisma.user.findFirst({
    where: { id: session.userId, churchId: session.churchId, role: "STUDENT" },
  });
  if (!user) return jsonError("غير مصرح", 401);

  const [agg, transactions, church] = await Promise.all([
    prisma.pointTransaction.aggregate({
      where: { studentId: user.id, churchId: session.churchId },
      _sum: { pointsAmount: true },
    }),
    prisma.pointTransaction.findMany({
      where: { studentId: user.id, churchId: session.churchId },
      include: {
        eventType: true,
        servant: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.church.findUnique({ where: { id: session.churchId } }),
  ]);

  return jsonOk({
    totalPoints: agg._sum.pointsAmount ?? 0,
    churchName: church?.name ?? "",
    transactions: transactions.map((t) => ({
      id: t.id,
      pointsAmount: t.pointsAmount,
      note: t.note,
      eventTitle: t.eventType.title,
      servantName: t.servant.fullName,
      createdAt: t.createdAt,
      createdAtLabel: formatArabicDate(t.createdAt),
    })),
  });
}
