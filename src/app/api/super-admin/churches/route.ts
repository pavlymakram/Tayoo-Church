import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession } from "@/lib/auth";
import { createChurchSchema } from "@/lib/validators";
import { DEFAULT_EVENT_TEMPLATES } from "@/lib/utils";

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
      where: { role: { in: ["SERVANT", "CHURCH_ADMIN"] } },
    }),
  };

  return jsonOk({
    totals,
    churches: churches.map((c) => ({
      id: c.id,
      name: c.name,
      licenseKey: c.licenseKey,
      isActive: c.isActive,
      createdAt: c.createdAt,
      userCount: c._count.users,
      eventCount: c._count.eventTypes,
      transactionCount: c._count.pointTransactions,
    })),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(createChurchSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existingPhone = await prisma.user.findFirst({
    where: { phone: data.adminPhone.trim() },
  });
  if (existingPhone) return jsonError("رقم تليفون الأدمن مستخدم بالفعل", 409);

  const church = await prisma.church.create({
    data: {
      name: data.name.trim(),
      licenseKey: generateLicenseKey(),
    },
  });

  for (const ev of DEFAULT_EVENT_TEMPLATES) {
    await prisma.eventType.create({
      data: {
        churchId: church.id,
        title: ev.title,
        defaultPoints: ev.defaultPoints,
      },
    });
  }

  const admin = await prisma.user.create({
    data: {
      churchId: church.id,
      role: "CHURCH_ADMIN",
      fullName: data.adminFullName.trim(),
      phone: data.adminPhone.trim(),
      passwordHash: await hashPassword(data.adminPassword),
    },
  });

  return jsonOk(
    {
      church: {
        id: church.id,
        name: church.name,
        licenseKey: church.licenseKey,
        isActive: church.isActive,
      },
      admin: {
        id: admin.id,
        fullName: admin.fullName,
        phone: admin.phone,
      },
    },
    201
  );
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body?.id) return jsonError("معرف الكنيسة مطلوب");

  const church = await prisma.church.findUnique({ where: { id: body.id } });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  const updated = await prisma.church.update({
    where: { id: church.id },
    data: {
      ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
      ...(body.regenerateLicense === true
        ? { licenseKey: generateLicenseKey() }
        : {}),
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
