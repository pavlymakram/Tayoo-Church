import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { studentLoginSchema } from "@/lib/validators";
import type { Role } from "@/lib/utils";
import { sanitizeUser } from "@/lib/sanitize";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(studentLoginSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  // Strict student auth: generated username (e.g. mar_ph_user_53971) + PIN/secret only.
  const username = data.username.trim().toLowerCase();

  let churchId: string | undefined;
  if (data.churchLicenseKey) {
    const church = await prisma.church.findUnique({
      where: { licenseKey: data.churchLicenseKey.trim() },
    });
    if (!church || !church.isActive) return jsonError("مفتاح الترخيص غير صحيح", 404);
    churchId = church.id;
  }

  const user = await prisma.user.findFirst({
    where: {
      role: "STUDENT",
      username,
      ...(churchId ? { churchId } : {}),
    },
  });

  if (!user) return jsonError("بيانات الدخول غير صحيحة", 401);
  if (user.churchId) {
    const church = await prisma.church.findUnique({ where: { id: user.churchId } });
    if (!church || !church.isActive) return jsonError("ترخيص الكنيسة موقوف", 403);
  }

  // The student's single secret is stored as the PIN hash, with legacy
  // password hashes still honored for accounts created before the merge.
  const pinOk = user.pinHash ? await verifyPassword(data.pin, user.pinHash) : false;
  const legacyPasswordOk =
    !pinOk && user.passwordHash ? await verifyPassword(data.pin, user.passwordHash) : false;
  if (!pinOk && !legacyPasswordOk) return jsonError("الرقم السري غير صحيح", 401);

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
