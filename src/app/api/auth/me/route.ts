import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { capabilitiesFor } from "@/lib/permissions";
import { sanitizeUser } from "@/lib/sanitize";
import { normalizeRole } from "@/lib/utils";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("غير مصرح", 401);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      phase: { select: { id: true, name: true, abbreviation: true, sector: true } },
      classRoom: { select: { id: true, name: true } },
    },
  });
  if (!user) return jsonError("المستخدم غير موجود", 404);

  const church = user.churchId
    ? await prisma.church.findUnique({
        where: { id: user.churchId },
        select: { id: true, name: true, abbreviation: true, licenseKey: true },
      })
    : null;

  const role = normalizeRole(user.role);

  return jsonOk({
    user: {
      ...sanitizeUser(user),
      phaseName: user.phase?.name ?? null,
      phaseAbbreviation: user.phase?.abbreviation ?? null,
      className: user.classRoom?.name ?? null,
    },
    church: church
      ? {
          id: church.id,
          name: church.name,
          abbreviation: church.abbreviation,
          licenseKey: role === "CHURCH_ADMIN" || role === "SUPER_ADMIN" ? church.licenseKey : undefined,
        }
      : null,
    permissions: {
      role,
      capabilities: capabilitiesFor(role),
      isFirstAdmin: user.isFirstAdmin,
      sector: user.sector,
    },
    session: { ...session, role },
  });
}
