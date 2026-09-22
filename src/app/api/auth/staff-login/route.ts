import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { staffLoginSchema } from "@/lib/validators";
import { ROLE_HOME, normalizeRole } from "@/lib/utils";
import { sanitizeUser } from "@/lib/sanitize";

const STAFF_ROLES = ["PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN", "SUPER_ADMIN"];

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(staffLoginSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;
  const identifier = (data.identifier || data.phone || "").trim();

  const user = await prisma.user.findFirst({
    where: {
      role: { in: STAFF_ROLES },
      OR: [{ username: identifier.toLowerCase() }, { phone: identifier }],
    },
    include: { church: true },
  });

  if (!user || !user.passwordHash) return jsonError("بيانات الدخول غير صحيحة", 401);
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) return jsonError("كلمة المرور غير صحيحة", 401);
  if (user.church && !user.church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);

  const role = normalizeRole(user.role);
  const token = await createSessionToken({
    userId: user.id,
    churchId: user.churchId,
    role,
    fullName: user.fullName,
  });
  await setSessionCookie(token);

  return jsonOk({
    user: sanitizeUser(user),
    church: user.church
      ? { id: user.church.id, name: user.church.name, abbreviation: user.church.abbreviation }
      : null,
    redirectTo: ROLE_HOME[role],
  });
}
