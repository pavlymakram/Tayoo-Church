import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { pointTransactionSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(pointTransactionSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const student = await prisma.user.findFirst({
    where: {
      id: data.studentId,
      churchId: session.churchId,
      role: "STUDENT",
    },
  });
  if (!student) return jsonError("المخدوم غير موجود في كنيستك", 404);

  const eventType = await prisma.eventType.findFirst({
    where: {
      id: data.eventTypeId,
      churchId: session.churchId,
      isActive: true,
    },
  });
  if (!eventType) return jsonError("المناسبة غير موجودة أو غير مفعّلة", 404);

  if (data.pointsAmount === 0) return jsonError("قيمة النقط لا يمكن أن تكون صفر");

  const tx = await prisma.pointTransaction.create({
    data: {
      churchId: session.churchId,
      studentId: student.id,
      servantId: session.userId,
      eventTypeId: eventType.id,
      pointsAmount: data.pointsAmount,
      note: data.note?.trim() || null,
    },
    include: { eventType: true, student: true },
  });

  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId: student.id, churchId: session.churchId },
    _sum: { pointsAmount: true },
  });

  return jsonOk(
    {
      transaction: {
        id: tx.id,
        pointsAmount: tx.pointsAmount,
        note: tx.note,
        eventTitle: tx.eventType.title,
        studentName: tx.student.fullName,
        createdAt: tx.createdAt,
      },
      studentTotalPoints: agg._sum.pointsAmount ?? 0,
    },
    201
  );
}
