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

  let churchId: string | undefined;
  if (data.churchLicenseKey) {
    const church = await prisma.church.findUnique({
      where: { licenseKey: data.churchLicenseKey.trim() },
    });
    if (!church || !church.isActive) return jsonError("مفتاح الترخيص غير صحيح", 404);
    churchId = church.id;
  }

  const candidates = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(churchId ? { churchId } : {}),
      ...(data.phone
        ? { phone: data.phone.trim() }
        : { fullName: { contains: data.fullName!.trim() } }),
    },
    take: 5,
  });

  if (candidates.length === 0) return jsonError("بيانات الدخول غير صحيحة", 401);

  let user = candidates[0];
  if (candidates.length > 1 && data.fullName && !data.phone) {
    const exact = candidates.find((c) => c.fullName === data.fullName!.trim());
    if (exact) user = exact;
  }

  if (!user.pinHash) return jsonError("بيانات الدخول غير صحيحة", 401);
  const ok = await verifyPassword(data.pin, user.pinHash);
  if (!ok) return jsonError("الرقم السري غير صحيح", 401);

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
