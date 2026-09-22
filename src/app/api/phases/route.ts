import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { isSectorKey, sectorAbbreviation, sectorLabel } from "@/lib/phases";
import { phaseUpsertSchema } from "@/lib/validators";

/**
 * Dynamic stages ("المراحل").
 *
 * Every church is provisioned with the default catalogue and may extend it with its
 * own English abbreviation codes, which immediately become valid username segments.
 */
export async function GET(req: Request) {
  const { session, error } = await requireSession([
    "STUDENT",
    "PHASE_SERVANT",
    "PHASE_ADMIN",
    "CHURCH_ADMIN",
    "SUPER_ADMIN",
  ]);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = session.role === "SUPER_ADMIN" ? searchParams.get("churchId")?.trim() : session.churchId;
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const includeInactive = searchParams.get("includeInactive") === "true";

  const phases = await prisma.phase.findMany({
    where: { churchId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { classes: true, users: true } },
    },
  });

  return jsonOk({
    phases: phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      abbreviation: phase.abbreviation,
      sector: phase.sector,
      sectorAbbreviation: phase.sectorAbbreviation,
      sectorName: sectorLabel(phase.sector),
      sortOrder: phase.sortOrder,
      isActive: phase.isActive,
      classCount: phase._count.classes,
      memberCount: phase._count.users,
    })),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(phaseUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const churchId = session.role === "SUPER_ADMIN" ? (typeof body.churchId === "string" ? body.churchId : "") : session.churchId;
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);
  if (!isSectorKey(data.sector)) return jsonError("القطاع غير صحيح");

  const taken = await prisma.phase.findFirst({
    where: { churchId, abbreviation: data.abbreviation },
    select: { id: true },
  });
  if (taken) return jsonError("كود المرحلة بالإنجليزية مستخدم بالفعل في هذه الكنيسة", 409);

  const maxOrder = await prisma.phase.aggregate({ where: { churchId }, _max: { sortOrder: true } });

  const phase = await prisma.phase.create({
    data: {
      churchId,
      name: data.name.trim(),
      abbreviation: data.abbreviation,
      sector: data.sector,
      sectorAbbreviation: sectorAbbreviation(data.sector)!,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      isActive: data.isActive ?? true,
    },
  });

  return jsonOk({ phase }, 201);
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body?.id) return jsonError("معرف المرحلة مطلوب");
  const parsed = parseBody(phaseUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;
  if (!isSectorKey(data.sector)) return jsonError("القطاع غير صحيح");

  const existing = await prisma.phase.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("المرحلة غير موجودة", 404);

  if (existing.abbreviation !== data.abbreviation) {
    const taken = await prisma.phase.findFirst({
      where: { churchId: existing.churchId, abbreviation: data.abbreviation, NOT: { id: existing.id } },
      select: { id: true },
    });
    if (taken) return jsonError("كود المرحلة بالإنجليزية مستخدم بالفعل", 409);
  }

  const phase = await prisma.phase.update({
    where: { id: existing.id },
    data: {
      name: data.name.trim(),
      abbreviation: data.abbreviation,
      sector: data.sector,
      sectorAbbreviation: sectorAbbreviation(data.sector)!,
      ...(typeof data.sortOrder === "number" ? { sortOrder: data.sortOrder } : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
    },
  });

  return jsonOk({ phase });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN"]);
  if (error || !session) return error!;

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف المرحلة مطلوب");

  const phase = await prisma.phase.findUnique({
    where: { id },
    include: { _count: { select: { users: true, classes: true } } },
  });
  if (!phase) return jsonError("المرحلة غير موجودة", 404);

  if (phase._count.users > 0 || phase._count.classes > 0) {
    return jsonError(
      `لا يمكن حذف المرحلة لوجود ${phase._count.users} مستخدم و${phase._count.classes} فصل مرتبطين بها — يمكنك تعطيلها بدلاً من ذلك`,
      409
    );
  }

  await prisma.phase.delete({ where: { id: phase.id } });
  return jsonOk({ ok: true, id: phase.id });
}
