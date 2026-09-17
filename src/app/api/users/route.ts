import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession, type SessionPayload } from "@/lib/auth";
import { adminUserUpsertSchema } from "@/lib/validators";
import { sanitizeUser } from "@/lib/sanitize";

const STAFF_ROLES = ["SERVANT", "CHURCH_ADMIN"] as const;

const updateUserSchema = adminUserUpsertSchema.extend({
  id: z.string().min(1, "معرف المستخدم مطلوب"),
});

function canManageStaff(session: SessionPayload) {
  return session.role === "CHURCH_ADMIN";
}

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const grade = searchParams.get("grade")?.trim();
  const role = searchParams.get("role")?.trim();
  const id = searchParams.get("id")?.trim();
  const churchId = session.churchId;

  if (id) {
    const user = await prisma.user.findFirst({
      where: { id, churchId, role: { not: "SUPER_ADMIN" } },
    });
    if (!user) return jsonError("المستخدم غير موجود", 404);
    const totalPoints =
      user.role === "STUDENT" ? await sumPoints(user.id, churchId) : undefined;
    return jsonOk({ user: { ...sanitizeUser(user), totalPoints } });
  }

  let roleFilter: string | { in: string[] } | undefined;
  if (role === "STAFF") roleFilter = { in: [...STAFF_ROLES] };
  else if (role === "STUDENT" || role === "SERVANT" || role === "CHURCH_ADMIN") roleFilter = role;
  else roleFilter = { in: ["STUDENT", "SERVANT", "CHURCH_ADMIN"] };

  const users = await prisma.user.findMany({
    where: {
      churchId,
      role: roleFilter,
      ...(grade ? { grade } : {}),
      ...(q
        ? { OR: [{ fullName: { contains: q } }, { phone: { contains: q } }] }
        : {}),
    },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const studentIds = users.filter((u) => u.role === "STUDENT").map((u) => u.id);
  const aggregates =
    studentIds.length > 0
      ? await prisma.pointTransaction.groupBy({
          by: ["studentId"],
          where: { churchId, studentId: { in: studentIds } },
          _sum: { pointsAmount: true },
        })
      : [];
  const pointsMap = new Map(aggregates.map((a) => [a.studentId, a._sum.pointsAmount ?? 0]));

  return jsonOk({
    users: users.map((u) => ({
      ...sanitizeUser(u),
      totalPoints: u.role === "STUDENT" ? pointsMap.get(u.id) ?? 0 : undefined,
    })),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(adminUserUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  if (data.role !== "STUDENT" && !canManageStaff(session)) {
    return jsonError("إضافة الخدام متاحة لأدمن الكنيسة فقط", 403);
  }

  const existing = await prisma.user.findFirst({
    where: { churchId: session.churchId, phone: data.phone.trim() },
  });
  if (existing) return jsonError("هذا الرقم مسجّل بالفعل في الكنيسة", 409);

  if (data.role === "STUDENT" && !data.pin) {
    return jsonError("الرقم السري (PIN) مطلوب للمخدوم", 400);
  }
  if (data.role !== "STUDENT" && !data.password) {
    return jsonError("كلمة المرور مطلوبة للخادم", 400);
  }

  const user = await prisma.user.create({
    data: {
      churchId: session.churchId,
      role: data.role,
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address?.trim() || null,
      grade: data.role === "STUDENT" ? data.grade || null : null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      confessionFather: data.confessionFather?.trim() || null,
      fatherJob: data.fatherJob?.trim() || null,
      isMotherWorking: data.isMotherWorking ?? false,
      motherJob: data.isMotherWorking ? data.motherJob?.trim() || null : null,
      pinHash: data.role === "STUDENT" && data.pin ? await hashPassword(data.pin) : null,
      passwordHash:
        data.role !== "STUDENT" && data.password ? await hashPassword(data.password) : null,
      qrCodeId: crypto.randomUUID(),
    },
  });

  return jsonOk({ user: sanitizeUser(user) }, 201);
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(updateUserSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { id: data.id, churchId: session.churchId },
  });
  if (!existing) return jsonError("المستخدم غير موجود", 404);
  if (existing.role === "SUPER_ADMIN") return jsonError("لا يمكن تعديل هذا الحساب", 403);

  const nextRole = data.role;
  if ((existing.role !== "STUDENT" || nextRole !== "STUDENT") && !canManageStaff(session)) {
    return jsonError("تعديل بيانات الخدام متاح لأدمن الكنيسة فقط", 403);
  }
  if (nextRole !== existing.role && !canManageStaff(session)) {
    return jsonError("تغيير الدور متاح لأدمن الكنيسة فقط", 403);
  }
  if (existing.id === session.userId && nextRole !== existing.role) {
    return jsonError("لا يمكنك تغيير دورك بنفسك", 400);
  }

  if (data.phone.trim() !== existing.phone) {
    const phoneTaken = await prisma.user.findFirst({
      where: {
        churchId: session.churchId,
        phone: data.phone.trim(),
        NOT: { id: existing.id },
      },
    });
    if (phoneTaken) return jsonError("رقم التليفون مستخدم بالفعل", 409);
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      role: nextRole,
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address?.trim() || null,
      grade: nextRole === "STUDENT" ? data.grade || null : null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      confessionFather: data.confessionFather?.trim() || null,
      fatherJob: data.fatherJob?.trim() || null,
      isMotherWorking: data.isMotherWorking ?? false,
      motherJob: data.isMotherWorking ? data.motherJob?.trim() || null : null,
      ...(data.pin ? { pinHash: await hashPassword(data.pin) } : {}),
      ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
    },
  });

  return jsonOk({ user: sanitizeUser(user) });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف المستخدم مطلوب");

  const existing = await prisma.user.findFirst({
    where: { id, churchId: session.churchId },
  });
  if (!existing) return jsonError("المستخدم غير موجود", 404);
  if (existing.id === session.userId) return jsonError("لا يمكنك حذف حسابك", 400);
  if (existing.role === "SUPER_ADMIN") return jsonError("لا يمكن حذف هذا الحساب", 403);
  if (existing.role !== "STUDENT" && !canManageStaff(session)) {
    return jsonError("حذف الخدام متاح لأدمن الكنيسة فقط", 403);
  }

  if (existing.role !== "STUDENT") {
    await prisma.pointTransaction.updateMany({
      where: { churchId: session.churchId, servantId: existing.id },
      data: { servantId: session.userId },
    });
  }

  await prisma.user.delete({ where: { id: existing.id } });
  return jsonOk({ ok: true });
}

async function sumPoints(studentId: string, churchId: string) {
  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId, churchId },
    _sum: { pointsAmount: true },
  });
  return agg._sum.pointsAmount ?? 0;
}
