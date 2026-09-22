import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { sanitizeUser } from "@/lib/sanitize";
import { resolveScope } from "@/lib/scope";

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"]);
  if (error || !session) return error!;

  if (!session.churchId && session.role !== "SUPER_ADMIN") {
    return jsonError("لا توجد كنيسة مرتبطة", 400);
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const grade = searchParams.get("grade")?.trim();
  const qr = searchParams.get("qr")?.trim();
  const id = searchParams.get("id")?.trim();
  const phaseId = searchParams.get("phaseId")?.trim();
  const classId = searchParams.get("classId")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));

  // Servants only ever reach students inside their own stage/sector.
  const scope = await resolveScope(session);
  const scopeFilter = scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } };

  const churchId = session.churchId!;

  if (qr) {
    const student = await prisma.user.findFirst({
      where: { churchId, role: "STUDENT", qrCodeId: qr, ...scopeFilter },
    });
    if (!student) return jsonError("لم يتم العثور على المخدوم", 404);
    const totalPoints = await sumPoints(student.id, churchId);
    return jsonOk({ student: { ...sanitizeUser(student), totalPoints } });
  }

  if (id) {
    const student = await prisma.user.findFirst({
      where: { id, churchId, role: "STUDENT", ...scopeFilter },
    });
    if (!student) return jsonError("لم يتم العثور على المخدوم", 404);
    const totalPoints = await sumPoints(student.id, churchId);
    return jsonOk({ student: { ...sanitizeUser(student), totalPoints } });
  }

  const where = {
      churchId,
      role: "STUDENT",
      ...scopeFilter,
      ...(grade ? { grade } : {}),
      ...(phaseId ? { phaseId } : {}),
      ...(classId ? { classId } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { phone: { contains: q } },
              { username: { contains: q.toLowerCase() } },
            ],
          }
        : {}),
    };
  const [students, total] = await Promise.all([prisma.user.findMany({
    where,
    orderBy: { fullName: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  }), prisma.user.count({ where })]);

  const ids = students.map((s) => s.id);
  const aggregates = await prisma.pointTransaction.groupBy({
    by: ["studentId"],
    where: { churchId, studentId: { in: ids } },
    _sum: { pointsAmount: true },
  });
  const pointsMap = new Map(aggregates.map((a) => [a.studentId, a._sum.pointsAmount ?? 0]));

  return jsonOk({
    pagination: { page, limit, total, hasMore: page * limit < total },
    students: students.map((s) => ({
      ...sanitizeUser(s),
      totalPoints: pointsMap.get(s.id) ?? 0,
    })),
  });
}

async function sumPoints(studentId: string, churchId: string) {
  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId, churchId },
    _sum: { pointsAmount: true },
  });
  return agg._sum.pointsAmount ?? 0;
}
