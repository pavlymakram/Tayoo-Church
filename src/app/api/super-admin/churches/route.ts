import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { createChurchSchema, updateChurchSchema } from "@/lib/validators";
import { createStaffAccount, provisionDefaultEventTypes, provisionDefaultPhases } from "@/lib/provision";

function generateLicenseKey() {
  return `TAYOO-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function GET() {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;

  const churches = await prisma.church.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          phases: true,
          classes: true,
          eventTypes: true,
          pointTransactions: true,
        },
      },
    },
  });

  const totals = {
    churches: churches.length,
    activeChurches: churches.filter((c) => c.isActive).length,
    students: await prisma.user.count({ where: { role: "STUDENT" } }),
    servants: await prisma.user.count({
      where: { role: { in: ["PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN"] } },
    }),
  };

  return jsonOk({
    totals,
    churches: churches.map((c) => ({
      id: c.id,
      name: c.name,
      abbreviation: c.abbreviation,
      licenseKey: c.licenseKey,
      isActive: c.isActive,
      createdAt: c.createdAt,
      userCount: c._count.users,
      phaseCount: c._count.phases,
      classCount: c._count.classes,
      eventCount: c._count.eventTypes,
      transactionCount: c._count.pointTransactions,
    })),
  });
}

/**
 * Creates a tenant: the church record with its dynamic English abbreviation, the
 * default stage catalogue, default event types, and the FIRST church admin whose
 * credentials are auto-generated (`{church}_admin_{5 digits}`).
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(createChurchSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const abbreviationTaken = await prisma.church.findUnique({
    where: { abbreviation: data.abbreviation },
    select: { id: true },
  });
  if (abbreviationTaken) return jsonError("كود الكنيسة بالإنجليزية مستخدم بالفعل", 409);

  const existingPhone = await prisma.user.findFirst({
    where: { phone: data.adminPhone.trim() },
    select: { id: true },
  });
  if (existingPhone) return jsonError("رقم تليفون الأدمن مستخدم بالفعل", 409);

  const result = await prisma.$transaction(async (tx) => {
    const church = await tx.church.create({
      data: {
        name: data.name.trim(),
        abbreviation: data.abbreviation,
        licenseKey: generateLicenseKey(),
      },
    });
    await provisionDefaultPhases(tx, church.id);
    await provisionDefaultEventTypes(tx, church.id);

    const admin = await createStaffAccount(tx, {
      churchId: church.id,
      churchAbbreviation: church.abbreviation,
      role: "CHURCH_ADMIN",
      fullName: data.adminFullName,
      phone: data.adminPhone,
      // The very first church admin owns the church-admin deletion privilege.
      isFirstAdmin: true,
      createdById: session.userId,
    });

    return { church, admin };
  });

  return jsonOk(
    {
      church: {
        id: result.church.id,
        name: result.church.name,
        abbreviation: result.church.abbreviation,
        licenseKey: result.church.licenseKey,
        isActive: result.church.isActive,
      },
      admin: {
        id: result.admin.user.id,
        fullName: result.admin.user.fullName,
        phone: result.admin.user.phone,
        username: result.admin.user.username,
        initialPassword: result.admin.initialPassword,
      },
    },
    201
  );
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(updateChurchSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const church = await prisma.church.findUnique({ where: { id: data.id } });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  if (data.abbreviation && data.abbreviation !== church.abbreviation) {
    const taken = await prisma.church.findUnique({
      where: { abbreviation: data.abbreviation },
      select: { id: true },
    });
    if (taken) return jsonError("كود الكنيسة بالإنجليزية مستخدم بالفعل", 409);
  }

  const updated = await prisma.church.update({
    where: { id: church.id },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.abbreviation ? { abbreviation: data.abbreviation } : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
      ...(data.regenerateLicense === true ? { licenseKey: generateLicenseKey() } : {}),
    },
  });

  return jsonOk({ church: updated });
}

/** Requires the tenant name as an intentional, non-replayable UI confirmation. */
export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;
  const body = await readJson(req);
  if (!body?.id || typeof body.confirmation !== "string") return jsonError("تأكيد الحذف مطلوب");
  const church = await prisma.church.findUnique({ where: { id: body.id } });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);
  if (body.confirmation.trim() !== church.name) return jsonError("اكتب اسم الكنيسة بالكامل لتأكيد الحذف", 400);
  // Relations use onDelete: Cascade. Deleting the tenant removes users, event types,
  // attendance/point records and all tenant-owned records in the same database action.
  await prisma.church.delete({ where: { id: church.id } });
  return jsonOk({ deleted: true, id: church.id });
}
