import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { classifyEvent, formatShortDate } from "@/lib/attendance";
import { resolveScope } from "@/lib/scope";

const eventNames = { mass: "القداس الإلهي", service: "حضور الخدمة / مدارس الأحد" } as const;

/**
 * QR attendance scan. Church admins are intentionally excluded (they curate the
 * church structure rather than scanning), and the scanned student must belong to the
 * caller's sector/stage.
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession([
    "SUPER_ADMIN",
    "PHASE_ADMIN",
    "PHASE_SERVANT",
  ]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  const rawKind: unknown = body?.kind;
  const kind: keyof typeof eventNames | null = rawKind === "mass" || rawKind === "service" ? rawKind : null;
  const qrCodeId = typeof body?.qrCodeId === "string" ? body.qrCodeId.trim() : "";
  if (!kind || !qrCodeId) return jsonError("بيانات المسح غير صالحة");

  const scope = await resolveScope(session);
  const churchId = session.churchId;

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  const student = await prisma.user.findFirst({
    where: {
      churchId,
      role: "STUDENT",
      qrCodeId,
      ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }),
    },
  });
  if (!church || !church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);
  if (!student) return jsonError("لم يتم العثور على المخدوم في نطاق خدمتك", 404);

  const points = kind === "mass" ? church.defaultMassPoints : church.defaultServicePoints;
  let event = await prisma.eventType.findFirst({ where: { churchId, title: eventNames[kind] } });
  if (!event) {
    event = await prisma.eventType.create({
      data: { churchId, title: eventNames[kind], defaultPoints: points },
    });
  }

  const transaction = await prisma.pointTransaction.create({
    data: {
      churchId,
      studentId: student.id,
      servantId: session.userId,
      eventTypeId: event.id,
      pointsAmount: points,
      note: kind === "mass" ? "مسح القداس" : "مسح الحضور",
    },
  });

  return jsonOk(
    {
      transaction: { id: transaction.id, pointsAmount: points },
      attendance: {
        kind: classifyEvent(event.title),
        date: formatShortDate(transaction.createdAt),
        isFriday: transaction.createdAt.getDay() === 5,
      },
      student: { id: student.id, fullName: student.fullName },
    },
    201
  );
}

