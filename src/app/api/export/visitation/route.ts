import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { buildVisitationWorkbook } from "@/lib/excel";

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const { searchParams } = new URL(req.url);
  const grade = searchParams.get("grade")?.trim();

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  const students = await prisma.user.findMany({
    where: {
      churchId: session.churchId,
      role: "STUDENT",
      ...(grade ? { grade } : {}),
    },
    orderBy: { fullName: "asc" },
  });

  const aggregates = await prisma.pointTransaction.groupBy({
    by: ["studentId"],
    where: {
      churchId: session.churchId,
      studentId: { in: students.map((s) => s.id) },
    },
    _sum: { pointsAmount: true },
  });
  const pointsMap = new Map(aggregates.map((a) => [a.studentId, a._sum.pointsAmount ?? 0]));

  const buffer = await buildVisitationWorkbook(
    church.name,
    students.map((s) => ({
      fullName: s.fullName,
      birthDate: s.birthDate,
      grade: s.grade,
      phone: s.phone,
      secondaryPhone: s.secondaryPhone,
      address: s.address,
      confessionFather: s.confessionFather,
      fatherJob: s.fatherJob,
      motherJob: s.motherJob,
      totalPoints: pointsMap.get(s.id) ?? 0,
    }))
  );

  const filename = encodeURIComponent(`افتقاد-${church.name}.xlsx`);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
