import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { sanitizeUser } from "@/lib/sanitize";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("غير مصرح", 401);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return jsonError("المستخدم غير موجود", 404);

  const church = user.churchId
    ? await prisma.church.findUnique({ where: { id: user.churchId } })
    : null;

  return jsonOk({
    user: sanitizeUser(user),
    church: church
      ? {
          id: church.id,
          name: church.name,
          licenseKey: session.role === "CHURCH_ADMIN" || session.role === "SUPER_ADMIN" ? church.licenseKey : undefined,
        }
      : null,
    session,
  });
}
