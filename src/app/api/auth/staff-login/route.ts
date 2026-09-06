import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { staffLoginSchema } from "@/lib/validators";
import type { Role } from "@/lib/utils";
import { sanitizeUser } from "@/lib/sanitize";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(staffLoginSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      phone: data.phone.trim(),
      role: { in: ["SERVANT", "CHURCH_ADMIN", "SUPER_ADMIN"] },
    },
  });

  if (!user || !user.passwordHash) return jsonError("بيانات الدخول غير صحيحة", 401);
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) return jsonError("كلمة المرور غير صحيحة", 401);

  if (user.churchId) {
    const church = await prisma.church.findUnique({ where: { id: user.churchId } });
    if (church && !church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);
  }

  const token = await createSessionToken({
    userId: user.id,
    churchId: user.churchId,
    role: user.role as Role,
    fullName: user.fullName,
  });
  await setSessionCookie(token);

  const church = user.churchId
    ? await prisma.church.findUnique({ where: { id: user.churchId } })
    : null;

  return jsonOk({
    user: sanitizeUser(user),
    church: church ? { id: church.id, name: church.name } : null,
  });
}
