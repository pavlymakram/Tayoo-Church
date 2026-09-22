import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { classifyEvent, formatShortDate, isFriday } from "@/lib/attendance";
import { formatArabicDate } from "@/lib/utils";

/**
 * Personal dashboard for المخدوم (student): QR identity, accumulated Tayoo points,
 * point history with the servant's full Arabic name, and the Friday attendance logs
 * (القداس + الخدمة) with exact DD/MM/YYYY dates.
 */
export async function GET() {
  const { session, error } = await requireSession(["STUDENT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const user = await prisma.user.findFirst({
    where: { id: session.userId, churchId: session.churchId, role: "STUDENT" },
    include: {
      phase: { select: { id: true, name: true, abbreviation: true } },
      classRoom: { select: { id: true, name: true } },
    },
  });
  if (!user) return jsonError("غير مصرح", 401);

  const [agg, transactions, church, assignedServant] = await Promise.all([
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
      take: 200,
    }),
    prisma.church.findUnique({ where: { id: session.churchId } }),
    prisma.user.findFirst({
      where: {
        churchId: session.churchId,
        role: { in: ["PHASE_SERVANT", "PHASE_ADMIN"] },
        ...(user.phaseId ? { phaseId: user.phaseId } : {}),
      },
      select: { fullName: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const liturgy: string[] = [];
  const service: string[] = [];

  for (const tx of transactions) {
    const kind = classifyEvent(tx.eventType.title);
    if (!kind || tx.pointsAmount <= 0 || !isFriday(tx.createdAt)) continue;
    const label = formatShortDate(tx.createdAt);
    const bucket = kind === "LITURGY" ? liturgy : service;
    if (!bucket.includes(label)) bucket.push(label);
  }

  liturgy.sort((a, b) => a.localeCompare(b));
  service.sort((a, b) => a.localeCompare(b));

  return jsonOk({
    totalPoints: agg._sum.pointsAmount ?? 0,
    churchName: church?.name ?? "",
    phaseName: user.phase?.name ?? null,
    phaseAbbreviation: user.phase?.abbreviation ?? null,
    className: user.classRoom?.name ?? null,
    username: user.username,
    servantName: assignedServant?.fullName ?? null,
    attendance: {
      liturgy,
      service,
      liturgyCount: liturgy.length,
      serviceCount: service.length,
      lastLiturgy: liturgy.length ? liturgy[liturgy.length - 1] : null,
      lastService: service.length ? service[service.length - 1] : null,
    },
    transactions: transactions.map((t) => ({
      id: t.id,
      pointsAmount: t.pointsAmount,
      note: t.note,
      eventTitle: t.eventType.title,
      kind: classifyEvent(t.eventType.title),
      // Full Arabic name of the servant who granted the points (never the username).
      servantName: t.servant.fullName,
      createdAt: t.createdAt,
      date: formatShortDate(t.createdAt),
      isFriday: isFriday(t.createdAt),
      createdAtLabel: formatArabicDate(t.createdAt),
    })),
  });
}
