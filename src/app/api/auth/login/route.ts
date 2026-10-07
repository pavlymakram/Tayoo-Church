import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { sanitizeUser } from "@/lib/sanitize";
import { ROLE_HOME, normalizeRole } from "@/lib/utils";

const STAFF_ROLES = ["PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN", "SUPER_ADMIN"];

/** Signs any account in and mirrors the 30-day session cookie. */
async function signIn(user: { id: string; churchId: string | null; role: string; fullName: string }) {
  const role = normalizeRole(user.role);
  const token = await createSessionToken({
    userId: user.id,
    churchId: user.churchId,
    role,
    fullName: user.fullName,
  });
  await setSessionCookie(token);
  return role;
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return jsonError("طلب غير صالح");
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret : "";
    if (!identifier || !secret) return jsonError("أدخل اسم المستخدم وكلمة المرور أو PIN");
    const mode = body.mode === "staff" ? "staff" : body.mode === "student" ? "student" : null;
    if (!mode) return jsonError("مسار تسجيل الدخول غير صالح", 400);

    // Fixed master code still requires the individual Super Admin password.
    if (mode === "staff" && identifier === "SuperAdmin1010") {
      const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
      if (!superAdmin?.passwordHash || !(await verifyPassword(secret, superAdmin.passwordHash))) {
        return jsonError("بيانات مدير النظام غير صحيحة", 401);
      }
      await signIn(superAdmin);
      return jsonOk({ user: sanitizeUser(superAdmin), church: null, redirectTo: ROLE_HOME.SUPER_ADMIN });
    }

    if (mode === "staff") {
      const staff = await prisma.user.findFirst({
        where: {
          role: { in: STAFF_ROLES },
          OR: [{ username: identifier.toLowerCase() }, { phone: identifier }],
        },
        include: { church: true },
      });
      if (!staff?.passwordHash || !(await verifyPassword(secret, staff.passwordHash))) {
        return jsonError("بيانات الدخول غير صحيحة", 401);
      }
      if (staff.church && !staff.church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);
      const role = await signIn(staff);
      return jsonOk({
        user: sanitizeUser(staff),
        church: staff.church ? { id: staff.church.id, name: staff.church.name, abbreviation: staff.church.abbreviation } : null,
        redirectTo: ROLE_HOME[role],
      });
    }

    // Strict path: generated username (e.g. mar_ph_user_53971) + secret only.
    // Full-name/phone fallbacks are intentionally removed.
    const byUsername = await prisma.user.findFirst({
      where: { role: "STUDENT", username: identifier.toLowerCase() },
      include: { church: true },
    });
    if (!byUsername) return jsonError("بيانات الدخول غير صحيحة", 401);
    if (byUsername.church && !byUsername.church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);
    const pinOk = byUsername.pinHash ? await verifyPassword(secret, byUsername.pinHash) : false;
    const passwordOk =
      !pinOk && byUsername.passwordHash ? await verifyPassword(secret, byUsername.passwordHash) : false;
    if (!pinOk && !passwordOk) return jsonError("بيانات الدخول غير صحيحة", 401);
    await signIn(byUsername);
    return jsonOk({
      user: sanitizeUser(byUsername),
      church: byUsername.church ? { id: byUsername.church.id, name: byUsername.church.name } : null,
      redirectTo: ROLE_HOME.STUDENT,
    });
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return jsonError("تعذر الاتصال بقاعدة البيانات — تحقق من إعدادات الخادم وحاول مجدداً", 500);
  }
}

