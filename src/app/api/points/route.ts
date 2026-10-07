import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { isLiturgyEvent, isLiturgyScanOpen, LITURGY_CUTOFF_MESSAGE } from "@/lib/attendance";
import {
  pointTransactionSchema,
  updatePointTransactionSchema,
} from "@/lib/validators";
import { formatArabicDate } from "@/lib/utils";
import { resolveScope } from "@/lib/scope";
import type { SessionPayload } from "@/lib/auth";

/** Every point mutation is confined to the caller's stage/sector scope. */
async function scopeFilterFor(session: SessionPayload) {
  const scope = await resolveScope(session);
  return scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } };
}

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));

  // Point records stay inside the caller's stage/sector scope.
  const scope = await resolveScope(session);
  const scopeFilter = scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } };

  if (studentId) {
    const student = await prisma.user.findFirst({
      where: { id: studentId, churchId: session.churchId, role: "STUDENT", ...scopeFilter },
    });
    if (!student) return jsonError("المخدوم غير موجود", 404);
  }

  const where = {
      churchId: session.churchId,
      student: { ...scopeFilter },
      ...(studentId ? { studentId } : {}),
    };
  const [transactions, total] = await Promise.all([prisma.pointTransaction.findMany({
    where,
    include: {
      eventType: { select: { id: true, title: true } },
      student: { select: { id: true, fullName: true, grade: true } },
      servant: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  }), prisma.pointTransaction.count({ where })]);

  const totalPoints = studentId
    ? (
        await prisma.pointTransaction.aggregate({
          where: { churchId: session.churchId, studentId },
          _sum: { pointsAmount: true },
        })
      )._sum.pointsAmount ?? 0
    : undefined;

  return jsonOk({
    totalPoints,
    pagination: { limit, offset, total, hasMore: offset + transactions.length < total },
    transactions: transactions.map((t) => ({
      id: t.id,
      pointsAmount: t.pointsAmount,
      note: t.note,
      createdAt: t.createdAt,
      createdAtLabel: formatArabicDate(t.createdAt),
      eventTypeId: t.eventType.id,
      eventTitle: t.eventType.title,
      studentId: t.student.id,
      studentName: t.student.fullName,
      studentGrade: t.student.grade,
      servantId: t.servant.id,
      servantName: t.servant.fullName,
    })),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(pointTransactionSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const scopeFilter = await scopeFilterFor(session);
  const student = await prisma.user.findFirst({
    where: { id: data.studentId, churchId: session.churchId, role: "STUDENT", ...scopeFilter },
  });
  if (!student) return jsonError("المخدوم غير موجود في نطاق خدمتك", 404);

  const eventType = await prisma.eventType.findFirst({
    where: { id: data.eventTypeId, churchId: session.churchId, isActive: true },
  });
  if (!eventType) return jsonError("المناسبة غير موجودة أو غير مفعّلة", 404);
  if (data.pointsAmount === 0) return jsonError("قيمة النقط لا يمكن أن تكون صفر");
  // Liturgy cutoff also applies to manual point entry for a Liturgy event.
  if (isLiturgyEvent(eventType.title) && !isLiturgyScanOpen(new Date())) {
    return jsonError(LITURGY_CUTOFF_MESSAGE, 403);
  }

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

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(updatePointTransactionSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const scopeFilter = await scopeFilterFor(session);
  const existing = await prisma.pointTransaction.findFirst({
    where: { id: data.id, churchId: session.churchId, student: { ...scopeFilter } },
  });
  if (!existing) return jsonError("الحركة غير موجودة داخل نطاق خدمتك", 404);

  if (typeof data.pointsAmount === "number" && data.pointsAmount === 0) {
    return jsonError("قيمة النقط لا يمكن أن تكون صفر — احذف الحركة بدلاً من ذلك");
  }

  if (data.eventTypeId) {
    const eventType = await prisma.eventType.findFirst({
      where: { id: data.eventTypeId, churchId: session.churchId },
    });
    if (!eventType) return jsonError("المناسبة غير موجودة", 404);
  }

  const tx = await prisma.pointTransaction.update({
    where: { id: existing.id },
    data: {
      ...(typeof data.pointsAmount === "number" ? { pointsAmount: data.pointsAmount } : {}),
      ...(data.note !== undefined ? { note: data.note?.trim() || null } : {}),
      ...(data.eventTypeId ? { eventTypeId: data.eventTypeId } : {}),
    },
    include: {
      eventType: true,
      student: true,
      servant: { select: { fullName: true } },
    },
  });

  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId: tx.studentId, churchId: session.churchId },
    _sum: { pointsAmount: true },
  });

  return jsonOk({
    transaction: {
      id: tx.id,
      pointsAmount: tx.pointsAmount,
      note: tx.note,
      eventTitle: tx.eventType.title,
      eventTypeId: tx.eventTypeId,
      studentName: tx.student.fullName,
      servantName: tx.servant.fullName,
      createdAt: tx.createdAt,
      createdAtLabel: formatArabicDate(tx.createdAt),
    },
    studentTotalPoints: agg._sum.pointsAmount ?? 0,
  });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف الحركة مطلوب");

  const existing = await prisma.pointTransaction.findFirst({
    where: { id, churchId: session.churchId, student: { ...(await scopeFilterFor(session)) } },
  });
  if (!existing) return jsonError("الحركة غير موجودة داخل نطاق خدمتك", 404);

  await prisma.pointTransaction.delete({ where: { id: existing.id } });

  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId: existing.studentId, churchId: session.churchId },
    _sum: { pointsAmount: true },
  });

  return jsonOk({
    ok: true,
    studentId: existing.studentId,
    studentTotalPoints: agg._sum.pointsAmount ?? 0,
  });
}
