import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { hashPassword, requireSession } from "@/lib/auth";

function cleanCode(value: string) { return value.trim().toUpperCase(); }

export async function GET() {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  const codes = await prisma.accessCode.findMany({
    where: session.role === "SUPER_ADMIN" ? {} : { churchId: session.churchId!, role: "SERVANT" },
    include: { church: { select: { name: true } }, loginUser: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ codes: codes.map((c) => ({ ...c, passwordHash: undefined, churchName: c.church?.name, userName: c.loginUser.fullName })) });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  const body = await readJson(req);
  const code = typeof body?.code === "string" ? cleanCode(body.code) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const requestedRole = body?.role === "CHURCH_ADMIN" ? "CHURCH_ADMIN" : body?.role === "SERVANT" ? "SERVANT" : null;
  if (!code || !/^[A-Z0-9-]{4,64}$/.test(code) || password.length < 4 || !displayName || !requestedRole) return jsonError("أدخل كوداً صالحاً واسم الدخول وكلمة مرور من 4 أحرف على الأقل");
  if (session.role === "CHURCH_ADMIN" && requestedRole !== "SERVANT") return jsonError("يمكن لأدمن الكنيسة إنشاء أكواد الخدام فقط", 403);
  const churchId = session.role === "SUPER_ADMIN" ? (typeof body?.churchId === "string" ? body.churchId : "") : session.churchId!;
  if (!churchId) return jsonError("اختر الكنيسة");
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);
  const maxUses = Number.isInteger(body?.maxUses) && body.maxUses > 0 ? body.maxUses : null;
  const expiresAt = typeof body?.expiresAt === "string" && body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return jsonError("تاريخ الانتهاء غير صالح");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const loginUser = await tx.user.create({ data: { churchId, role: requestedRole, fullName: displayName, phone: `CODE-${randomUUID()}`, passwordHash: await hashPassword(password) } });
      return tx.accessCode.create({ data: { code, role: requestedRole, churchId, loginUserId: loginUser.id, passwordHash: await hashPassword(password), maxUses, expiresAt, createdById: session.userId } });
    });
    return jsonOk({ code: { id: result.id, code: result.code, role: result.role, maxUses: result.maxUses, expiresAt: result.expiresAt } }, 201);
  } catch {
    return jsonError("هذا الكود مستخدم بالفعل", 409);
  }
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  const body = await readJson(req);
  const existing = typeof body?.id === "string" ? await prisma.accessCode.findUnique({ where: { id: body.id } }) : null;
  if (!existing || (session.role !== "SUPER_ADMIN" && (existing.churchId !== session.churchId || existing.role !== "SERVANT"))) return jsonError("الكود غير موجود", 404);
  const code = await prisma.accessCode.update({ where: { id: existing.id }, data: { ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}) } });
  return jsonOk({ code });
}
