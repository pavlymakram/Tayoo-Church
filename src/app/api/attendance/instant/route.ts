import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const eventNames = { mass: "القداس الإلهي", service: "حضور الخدمة / مدارس الأحد" } as const;

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);
  const body = await readJson(req);
  const rawKind: unknown = body?.kind;
  const kind: keyof typeof eventNames | null = rawKind === "mass" || rawKind === "service" ? rawKind : null;
  const qrCodeId = typeof body?.qrCodeId === "string" ? body.qrCodeId.trim() : "";
  if (!kind || !qrCodeId) return jsonError("بيانات المسح غير صالحة");

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  const student = await prisma.user.findFirst({ where: { churchId: session.churchId, role: "STUDENT", qrCodeId } });
  if (!church || !church.isActive || !student) return jsonError("لم يتم العثور على المخدوم في كنيستك", 404);
  const points = kind === "mass" ? church.defaultMassPoints : church.defaultServicePoints;
  let event = await prisma.eventType.findFirst({ where: { churchId: session.churchId, title: eventNames[kind] } });
  if (!event) event = await prisma.eventType.create({ data: { churchId: session.churchId, title: eventNames[kind], defaultPoints: points } });
  const transaction = await prisma.pointTransaction.create({ data: { churchId: session.churchId, studentId: student.id, servantId: session.userId, eventTypeId: event.id, pointsAmount: points, note: kind === "mass" ? "مسح سريع: القداس" : "مسح سريع: الخدمة" } });
  return jsonOk({ transaction: { id: transaction.id, pointsAmount: points }, student: { id: student.id, fullName: student.fullName } }, 201);
}
