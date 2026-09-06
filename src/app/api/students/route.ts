import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { sanitizeUser } from "@/lib/sanitize";

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN", "SUPER_ADMIN"]);
  if (error || !session) return error!;

  if (!session.churchId && session.role !== "SUPER_ADMIN") {
    return jsonError("لا توجد كنيسة مرتبطة", 400);
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const grade = searchParams.get("grade")?.trim();
  const qr = searchParams.get("qr")?.trim();
  const id = searchParams.get("id")?.trim();

  const churchId = session.churchId!;

  if (qr) {
    const student = await prisma.user.findFirst({
      where: { churchId, role: "STUDENT", qrCodeId: qr },
    });
    if (!student) return jsonError("لم يتم العثور على المخدوم", 404);
    const totalPoints = await sumPoints(student.id, churchId);
    return jsonOk({ student: { ...sanitizeUser(student), totalPoints } });
  }

  if (id) {
    const student = await prisma.user.findFirst({
      where: { id, churchId, role: "STUDENT" },
    });
    if (!student) return jsonError("لم يتم العثور على المخدوم", 404);
    const totalPoints = await sumPoints(student.id, churchId);
    return jsonOk({ student: { ...sanitizeUser(student), totalPoints } });
  }

  const students = await prisma.user.findMany({
    where: {
      churchId,
      role: "STUDENT",
      ...(grade ? { grade } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: "asc" },
  });

  const ids = students.map((s) => s.id);
  const aggregates = await prisma.pointTransaction.groupBy({
    by: ["studentId"],
    where: { churchId, studentId: { in: ids } },
    _sum: { pointsAmount: true },
  });
  const pointsMap = new Map(aggregates.map((a) => [a.studentId, a._sum.pointsAmount ?? 0]));

  return jsonOk({
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
