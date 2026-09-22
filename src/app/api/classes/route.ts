import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isPhaseInScope, resolveScope } from "@/lib/scope";
import { classUpsertSchema } from "@/lib/validators";

/**
 * Dynamic classes ("الفصول") inside a stage.
 *
 * Phase admins create and manage any number of classes per stage; church admins may
 * edit/delete them inside their church without creating new ones.
 */
export async function GET(req: Request) {
  const { session, error } = await requireSession([
    "PHASE_SERVANT",
    "PHASE_ADMIN",
    "CHURCH_ADMIN",
    "SUPER_ADMIN",
  ]);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = session.role === "SUPER_ADMIN" ? searchParams.get("churchId")?.trim() : session.churchId;
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const phaseId = searchParams.get("phaseId")?.trim();
  const scope = await resolveScope(session);

  const classes = await prisma.class.findMany({
    where: {
      churchId,
      ...(phaseId ? { phaseId } : {}),
      ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }),
    },
    orderBy: [{ phaseId: "asc" }, { name: "asc" }],
    include: {
      phase: { select: { id: true, name: true, abbreviation: true } },
      _count: { select: { members: true } },
    },
  });

  return jsonOk({
    classes: classes.map((item) => ({
      id: item.id,
      name: item.name,
      phaseId: item.phaseId,
      phaseName: item.phase.name,
      phaseAbbreviation: item.phase.abbreviation,
      memberCount: item._count.members,
    })),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(classUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const scope = await resolveScope(session);
  if (!can(scope.role, "createClasses")) return jsonError("إنشاء الفصول متاح لأدمن القطاع فقط", 403);

  const phase = await prisma.phase.findFirst({
    where: { id: data.phaseId, ...(scope.churchWide ? {} : { churchId: scope.churchId ?? undefined }) },
    select: { id: true, churchId: true },
  });
  if (!phase) return jsonError("المرحلة غير موجودة", 404);
  if (!isPhaseInScope(scope, phase.id)) return jsonError("لا تملك صلاحية على هذه المرحلة", 403);

  const name = data.name.trim();
  const existing = await prisma.class.findFirst({
    where: { churchId: phase.churchId, phaseId: phase.id, name },
    select: { id: true },
  });
  if (existing) return jsonError("هذا الفصل موجود بالفعل في المرحلة", 409);

  const created = await prisma.class.create({
    data: { churchId: phase.churchId, phaseId: phase.id, name },
  });

  return jsonOk({ class: created }, 201);
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body?.id) return jsonError("معرف الفصل مطلوب");
  const parsed = parseBody(classUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const scope = await resolveScope(session);
  if (!can(scope.role, "manageClasses")) return jsonError("لا تملك صلاحية تعديل الفصول", 403);

  const existing = await prisma.class.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("الفصل غير موجود", 404);
  if (scope.role !== "SUPER_ADMIN" && existing.churchId !== scope.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }
  if (!isPhaseInScope(scope, existing.phaseId)) return jsonError("لا تملك صلاحية على هذا الفصل", 403);
  if (!isPhaseInScope(scope, data.phaseId)) return jsonError("لا تملك صلاحية على المرحلة المطلوبة", 403);

  const updated = await prisma.class.update({
    where: { id: existing.id },
    data: { name: data.name.trim(), phaseId: data.phaseId },
  });

  return jsonOk({ class: updated });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف الفصل مطلوب");

  const scope = await resolveScope(session);
  if (!can(scope.role, "manageClasses")) return jsonError("لا تملك صلاحية حذف الفصول", 403);

  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) return jsonError("الفصل غير موجود", 404);
  if (scope.role !== "SUPER_ADMIN" && existing.churchId !== scope.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }
  if (!isPhaseInScope(scope, existing.phaseId)) return jsonError("لا تملك صلاحية على هذا الفصل", 403);

  await prisma.class.delete({ where: { id: existing.id } });
  return jsonOk({ ok: true, id: existing.id });
}
