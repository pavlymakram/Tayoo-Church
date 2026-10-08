import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import {
  classifyEvent,
  formatShortDate,
  isLiturgyScanOpen,
  LITURGY_CUTOFF_MESSAGE,
} from "@/lib/attendance";
import { resolveScope } from "@/lib/scope";

const SCAN_ROLES = ["SUPER_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"] as const;

const eventNames = { mass: "القداس الإلهي", service: "حضور الخدمة / مدارس الأحد" } as const;

/**
 * Bulk attendance sync for the offline queue.
 *
 * Accepts up to 200 scans captured while the device was offline. Every scan
 * carries its original local `scannedAt` timestamp, and ALL business rules —
 * including the Liturgy 08:00 AM Africa/Cairo cutoff — are evaluated against
 * that original moment, never against the sync time. Each item reports its own
 * outcome so the client can drop permanent failures and retry transient ones.
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession([...SCAN_ROLES]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  const scans = Array.isArray(body?.scans) ? body.scans.slice(0, 200) : null;
  if (!scans || scans.length === 0) return jsonError("قائمة المسح غير صالحة");

  const scope = await resolveScope(session);
  const churchId = session.churchId;

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church || !church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);

  const results: Record<string, unknown>[] = [];

  for (const raw of scans) {
    const kind: keyof typeof eventNames | null =
      raw?.kind === "mass" || raw?.kind === "service" ? raw.kind : null;
    const qrCodeId = typeof raw?.qrCodeId === "string" ? raw.qrCodeId.trim() : "";
    const clientId = typeof raw?.clientId === "string" ? raw.clientId : null;

    // The original local scan moment — cutoff rules bind to this instant.
    let effectiveTime = new Date();
    if (typeof raw?.scannedAt === "string") {
      const parsed = new Date(raw.scannedAt);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now() + 5 * 60 * 1000) {
        effectiveTime = parsed;
      }
    }

    const fail = (message: string, retryable: boolean) => ({
      clientId,
      ok: false,
      retryable,
      error: message,
    });

    if (!kind || !qrCodeId) {
      results.push(fail("بيانات المسح غير صالحة", false));
      continue;
    }

    // Strict Liturgy window bound to the ORIGINAL scan time (offline-safe).
    if (kind === "mass" && !isLiturgyScanOpen(effectiveTime)) {
      results.push(fail(LITURGY_CUTOFF_MESSAGE, false));
      continue;
    }

    const student = await prisma.user.findFirst({
      where: {
        churchId,
        role: "STUDENT",
        qrCodeId,
        ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }),
      },
    });
    if (!student) {
      results.push(fail("لم يتم العثور على المخدوم في نطاق خدمتك", false));
      continue;
    }

    const points = kind === "mass" ? church.defaultMassPoints : church.defaultServicePoints;
    let event = await prisma.eventType.findFirst({
      where: { churchId, title: eventNames[kind] },
    });
    if (!event) {
      event = await prisma.eventType.create({
        data: { churchId, title: eventNames[kind], defaultPoints: points },
      });
    }

    try {
      const transaction = await prisma.pointTransaction.create({
        data: {
          churchId,
          studentId: student.id,
          servantId: session.userId,
          eventTypeId: event.id,
          pointsAmount: points,
          note: kind === "mass" ? "مسح القداس (مزامنة دون اتصال)" : "مسح الحضور (مزامنة دون اتصال)",
          // Preserve the original offline scan moment on the ledger.
          createdAt: effectiveTime,
        },
      });
      results.push({
        clientId,
        ok: true,
        retryable: false,
        transactionId: transaction.id,
        studentName: student.fullName,
        points,
        kind: classifyEvent(event.title),
        date: formatShortDate(transaction.createdAt),
      });
    } catch {
      results.push(fail("تعذر حفظ المسح — سيُعاد المحاولة", true));
    }
  }

  const synced = results.filter((r) => r.ok).length;
  return jsonOk({
    results,
    summary: { total: results.length, synced, failed: results.length - synced },
  });
}
