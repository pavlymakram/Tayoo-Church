import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { adjustBalanceSchema } from "@/lib/validators";

async function getOrCreateAdjustEvent(churchId: string) {
  const title = "تعديل رصيد يدوي";
  let event = await prisma.eventType.findFirst({
    where: { churchId, title },
  });
  if (!event) {
    event = await prisma.eventType.create({
      data: {
        churchId,
        title,
        defaultPoints: 0,
        isActive: true,
      },
    });
  }
  return event;
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(adjustBalanceSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const student = await prisma.user.findFirst({
    where: {
      id: data.studentId,
      churchId: session.churchId,
      role: "STUDENT",
    },
  });
  if (!student) return jsonError("المخدوم غير موجود", 404);

  const current =
    (
      await prisma.pointTransaction.aggregate({
        where: { churchId: session.churchId, studentId: student.id },
        _sum: { pointsAmount: true },
      })
    )._sum.pointsAmount ?? 0;

  const delta =
    data.mode === "set" ? data.value - current : data.value;

  if (delta === 0) {
    return jsonError("الرصيد الحالي مطابق للقيمة المطلوبة — لا يوجد تعديل");
  }

  const event = await getOrCreateAdjustEvent(session.churchId);
  const noteParts = [
    data.mode === "set" ? `تعيين الرصيد إلى ${data.value}` : `تعديل بمقدار ${delta > 0 ? "+" : ""}${delta}`,
    data.note?.trim() || null,
  ].filter(Boolean);

  const tx = await prisma.pointTransaction.create({
    data: {
      churchId: session.churchId,
      studentId: student.id,
      servantId: session.userId,
      eventTypeId: event.id,
      pointsAmount: delta,
      note: noteParts.join(" — "),
    },
    include: { eventType: true },
  });

  return jsonOk(
    {
      transaction: {
        id: tx.id,
        pointsAmount: tx.pointsAmount,
        note: tx.note,
        eventTitle: tx.eventType.title,
        createdAt: tx.createdAt,
      },
      previousBalance: current,
      studentTotalPoints: current + delta,
    },
    201
  );
}
