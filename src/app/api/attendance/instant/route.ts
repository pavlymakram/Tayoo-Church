import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { classifyEvent, formatShortDate, isLiturgyScanOpen, LITURGY_CUTOFF_MESSAGE } from "@/lib/attendance";
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
  // Manual name-search path: the client confirms a student id from the scoped
  // search results and logs attendance identically to a QR scan.
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  const manual = !qrCodeId && !!studentId;
  if (!kind || (!qrCodeId && !studentId)) return jsonError("بيانات المسح غير صالحة");

  // Manual logging is strictly limited to phase roles (never church admins).
  if (manual && session.role !== "PHASE_ADMIN" && session.role !== "PHASE_SERVANT" && session.role !== "SUPER_ADMIN") {
    return jsonError("لا تملك صلاحية التسجيل اليدوي", 403);
  }

  // Offline-safe: synced scans carry their original local scan moment, and the
  // Liturgy cutoff binds to THAT moment — never to the later sync time.
  let effectiveTime = new Date();
  if (typeof body?.scannedAt === "string") {
    const parsed = new Date(body.scannedAt);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now() + 5 * 60 * 1000) {
      effectiveTime = parsed;
    }
  }

  // Strict Liturgy window: registration closes at 08:00 Cairo time (EEST).
  if (kind === "mass" && !isLiturgyScanOpen(effectiveTime)) {
    return jsonError(LITURGY_CUTOFF_MESSAGE, 403);
  }

  const scope = await resolveScope(session);
  const churchId = session.churchId;

  // Batched fetch: church config + scoped student in parallel for instant response.
  const [church, student] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { id: true, isActive: true, defaultMassPoints: true, defaultServicePoints: true } }),
    prisma.user.findFirst({
      where: {
        churchId,
        role: "STUDENT",
        ...(qrCodeId ? { qrCodeId } : { id: studentId }),
        ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }),
      },
      // Selective fields: manual search + scan response need identity only.
      select: {
        id: true,
        fullName: true,
        phase: { select: { name: true } },
        classRoom: { select: { name: true } },
      },
    }),
  ]);
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
      // Offline-synced scans preserve their original local scan moment.
      createdAt: effectiveTime,
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

