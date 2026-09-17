import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { sanitizeUser } from "@/lib/sanitize";
import type { Role } from "@/lib/utils";

const destination: Record<Role, string> = {
  STUDENT: "/student/dashboard",
  SERVANT: "/servant/quick-scan",
  CHURCH_ADMIN: "/admin/dashboard",
  SUPER_ADMIN: "/super-admin/tenants",
};

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!identifier || !secret) return jsonError("أدخل الاسم أو الكود وكلمة المرور أو PIN");
  const mode = body.mode === "staff" ? "staff" : body.mode === "student" ? "student" : null;
  if (!mode) return jsonError("مسار تسجيل الدخول غير صالح", 400);
  const value = identifier;

  // Fixed master code still requires the individual Super Admin password.
  if (mode === "staff" && value === "SuperAdmin1010") {
    const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    if (!superAdmin?.passwordHash || !await verifyPassword(secret, superAdmin.passwordHash)) return jsonError("بيانات مدير النظام غير صحيحة", 401);
    const token = await createSessionToken({ userId: superAdmin.id, churchId: null, role: "SUPER_ADMIN", fullName: superAdmin.fullName });
    await setSessionCookie(token);
    return jsonOk({ user: sanitizeUser(superAdmin), church: null, redirectTo: destination.SUPER_ADMIN });
  }

  const accessCode = mode === "staff" ? await prisma.accessCode.findUnique({ where: { code: value.toUpperCase() }, include: { church: true, loginUser: true } }) : null;
  if (accessCode) {
    const exhausted = accessCode.maxUses !== null && accessCode.usageCount >= accessCode.maxUses;
    if (!accessCode.isActive || exhausted || (accessCode.expiresAt && accessCode.expiresAt <= new Date()) || !accessCode.church?.isActive) return jsonError("كود الدخول غير نشط أو انتهت صلاحيته", 403);
    if (!await verifyPassword(secret, accessCode.passwordHash)) return jsonError("كلمة مرور كود الدخول غير صحيحة", 401);
    await prisma.accessCode.update({ where: { id: accessCode.id }, data: { usageCount: { increment: 1 } } });
    const role = accessCode.loginUser.role as Role;
    const token = await createSessionToken({ userId: accessCode.loginUser.id, churchId: accessCode.loginUser.churchId, role, fullName: accessCode.loginUser.fullName });
    await setSessionCookie(token);
    return jsonOk({ user: sanitizeUser(accessCode.loginUser), church: accessCode.church ? { id: accessCode.church.id, name: accessCode.church.name } : null, redirectTo: destination[role] });
  }

  if (mode === "staff") return jsonError("كود الخدمة غير صحيح", 401);

  // The public route only accepts student name or phone lookups.
  const candidates = await prisma.user.findMany({
    where: { role: "STUDENT", OR: [{ phone: value }, { fullName: value }] },
    include: { church: true },
    take: 10,
  });
  if (!candidates.length) return jsonError("بيانات الدخول غير صحيحة", 401);

  let user = null;
  for (const candidate of candidates) {
    if (candidate.church && !candidate.church.isActive) continue;
    const valid = Boolean(candidate.pinHash && await verifyPassword(secret, candidate.pinHash));
    if (valid) { user = candidate; break; }
  }
  if (!user) return jsonError("بيانات الدخول غير صحيحة", 401);

  const role = user.role as Role;
  const token = await createSessionToken({ userId: user.id, churchId: user.churchId, role, fullName: user.fullName });
  await setSessionCookie(token);
  return jsonOk({
    user: sanitizeUser(user),
    church: user.church ? { id: user.church.id, name: user.church.name } : null,
    redirectTo: destination[role],
  });
}
