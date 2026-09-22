import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession, type SessionPayload } from "@/lib/auth";
import { allocateUsername, buildUsername, generateInitialPassword } from "@/lib/credentials";
import { can } from "@/lib/permissions";
import { sanitizeUser } from "@/lib/sanitize";
import { isPhaseInScope, resolveScope } from "@/lib/scope";
import { studentUpsertSchema } from "@/lib/validators";
import type { Role } from "@/lib/utils";

/** Students (المخدومون) — creation/edit scoped to the caller's stage or sector. */
const READ_ROLES: Role[] = ["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"];

const userInclude = {
  phase: { select: { id: true, name: true, abbreviation: true } },
  classRoom: { select: { id: true, name: true } },
} as const;

async function resolveChurchId(session: SessionPayload, requested?: string | null) {
  if (session.role === "SUPER_ADMIN") {
    const churchId = typeof requested === "string" ? requested.trim() : "";
    if (!churchId) return null;
    return (await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } }))?.id ?? null;
  }
  return session.churchId;
}

async function sumPoints(studentId: string, churchId: string) {
  const agg = await prisma.pointTransaction.aggregate({
    where: { studentId, churchId },
    _sum: { pointsAmount: true },
  });
  return agg._sum.pointsAmount ?? 0;
}

export async function GET(req: Request) {
  const { session, error } = await requireSession(READ_ROLES);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = await resolveChurchId(session, searchParams.get("churchId"));
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }

  const q = searchParams.get("q")?.trim();
  const grade = searchParams.get("grade")?.trim();
  const role = searchParams.get("role")?.trim();
  const phaseId = searchParams.get("phaseId")?.trim();
  const classId = searchParams.get("classId")?.trim();
  const id = searchParams.get("id")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));

  const scopeFilter = scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } };

  if (id) {
    const user = await prisma.user.findFirst({
      where: { id, churchId, role: { not: "SUPER_ADMIN" }, ...scopeFilter },
      include: userInclude,
    });
    if (!user) return jsonError("المستخدم غير موجود", 404);
    const totalPoints = user.role === "STUDENT" ? await sumPoints(user.id, churchId) : undefined;
    return jsonOk({
      user: {
        ...sanitizeUser(user),
        phaseName: user.phase?.name ?? null,
        className: user.classRoom?.name ?? null,
        totalPoints,
      },
    });
  }

  let roleFilter: string | { in: string[] } = "STUDENT";
  if (role === "ALL") roleFilter = { in: ["STUDENT", "PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN"] };
  else if (role === "STAFF") roleFilter = { in: ["PHASE_SERVANT", "PHASE_ADMIN", "CHURCH_ADMIN"] };
  else if (role === "PHASE") roleFilter = { in: ["PHASE_SERVANT", "PHASE_ADMIN"] };
  else if (role === "STUDENT" || role === "PHASE_SERVANT" || role === "PHASE_ADMIN" || role === "CHURCH_ADMIN") roleFilter = role;

  const where = {
    churchId,
    role: roleFilter,
    ...scopeFilter,
    ...(grade ? { grade } : {}),
    ...(phaseId ? { phaseId } : {}),
    ...(classId ? { classId } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q } },
            { phone: { contains: q } },
            { username: { contains: q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const [users, total, phases, classes] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: userInclude,
    }),
    prisma.user.count({ where }),
    prisma.phase.findMany({
      where: { churchId, ...(scope.churchWide ? {} : { id: { in: scope.phaseIds } }) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, abbreviation: true, sector: true, sectorAbbreviation: true },
    }),
    prisma.class.findMany({
      where: { churchId, ...(scope.churchWide ? {} : { phaseId: { in: scope.phaseIds } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phaseId: true },
    }),
  ]);

  const studentIds = users.filter((u) => u.role === "STUDENT").map((u) => u.id);
  const aggregates =
    studentIds.length > 0
      ? await prisma.pointTransaction.groupBy({
          by: ["studentId"],
          where: { churchId, studentId: { in: studentIds } },
          _sum: { pointsAmount: true },
        })
      : [];
  const pointsMap = new Map(aggregates.map((a) => [a.studentId, a._sum.pointsAmount ?? 0]));

  return jsonOk({
    pagination: { page, limit, total, hasMore: page * limit < total },
    phases,
    classes,
    me: {
      role: scope.role,
      sector: scope.sector,
      churchWide: scope.churchWide,
      canCreateStudents: can(scope.role, "createStudents"),
      canManageStudents: can(scope.role, "manageStudents"),
    },
    users: users.map((user) => ({
      ...sanitizeUser(user),
      phaseName: user.phase?.name ?? null,
      phaseAbbreviation: user.phase?.abbreviation ?? null,
      className: user.classRoom?.name ?? null,
      totalPoints: user.role === "STUDENT" ? pointsMap.get(user.id) ?? 0 : undefined,
    })),
  });
}


type AssignmentCheck = { error: string; status: number } | { phaseId: string; phaseName: string; classId: string | null };

async function resolveStudentAssignment(
  churchId: string,
  scope: Awaited<ReturnType<typeof resolveScope>>,
  input: { phaseId?: string | null; classId?: string | null }
): Promise<AssignmentCheck> {
  const phaseId = input.phaseId?.trim() || scope.assignedPhaseId || "";
  if (!phaseId) return { error: "اختر المرحلة للمخدوم", status: 400 };

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, churchId },
    select: { id: true, name: true },
  });
  if (!phase) return { error: "المرحلة غير موجودة", status: 404 };
  if (!isPhaseInScope(scope, phase.id)) return { error: "لا تملك صلاحية على هذه المرحلة", status: 403 };

  let classId: string | null = null;
  if (input.classId) {
    const target = await prisma.class.findFirst({
      where: { id: input.classId, churchId },
      select: { id: true, phaseId: true },
    });
    if (!target) return { error: "الفصل غير موجود", status: 404 };
    if (target.phaseId !== phase.id) return { error: "الفصل لا يتبع المرحلة المختارة", status: 400 };
    if (!isPhaseInScope(scope, target.phaseId)) return { error: "لا تملك صلاحية على هذا الفصل", status: 403 };
    classId = target.id;
  }

  return { phaseId: phase.id, phaseName: phase.name, classId };
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(READ_ROLES);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(studentUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const churchId = await resolveChurchId(session, typeof body.churchId === "string" ? body.churchId : null);
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (!can(scope.role, "createStudents")) {
    return jsonError("إضافة المخدومين متاحة للخدام وأدمن القطاع — أدمن الكنيسة يدير الهيكل فقط", 403);
  }

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { abbreviation: true },
  });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  const assignment = await resolveStudentAssignment(churchId, scope, data);
  if ("error" in assignment) return jsonError(assignment.error, assignment.status);

  const existing = await prisma.user.findFirst({
    where: { churchId, phone: data.phone.trim() },
    select: { id: true },
  });
  if (existing) return jsonError("هذا الرقم مسجّل بالفعل في الكنيسة", 409);

  const initialPassword = generateInitialPassword();
  const username = await allocateUsername(
    () => buildUsername({ churchAbbreviation: church.abbreviation, role: "STUDENT" }),
    async (candidate) => !!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))
  );

  const user = await prisma.user.create({
    data: {
      churchId,
      role: "STUDENT",
      fullName: data.fullName.trim(),
      username,
      initialPassword,
      passwordHash: await hashPassword(initialPassword),
      phone: data.phone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address?.trim() || null,
      grade: data.grade?.trim() || assignment.phaseName,
      phaseId: assignment.phaseId,
      classId: assignment.classId,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      confessionFather: data.confessionFather?.trim() || null,
      fatherJob: data.fatherJob?.trim() || null,
      isMotherWorking: data.isMotherWorking ?? false,
      motherJob: data.isMotherWorking ? data.motherJob?.trim() || null : null,
      pinHash: data.pin ? await hashPassword(data.pin) : null,
      createdById: session.userId,
    },
  });

  return jsonOk(
    { user: { ...sanitizeUser(user), phaseName: assignment.phaseName }, username, initialPassword },
    201
  );
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(READ_ROLES);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body?.id) return jsonError("معرف المخدوم مطلوب");
  const parsed = parseBody(studentUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const scope = await resolveScope(session);
  if (!can(scope.role, "manageStudents")) return jsonError("لا تملك صلاحية تعديل المخدومين", 403);

  const existing = await prisma.user.findFirst({ where: { id: body.id, role: "STUDENT" } });
  if (!existing || !existing.churchId) return jsonError("المخدوم غير موجود", 404);
  if (scope.role !== "SUPER_ADMIN" && existing.churchId !== scope.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }
  if (!isPhaseInScope(scope, existing.phaseId)) return jsonError("لا تملك صلاحية على هذا المخدوم", 403);

  const assignment = await resolveStudentAssignment(existing.churchId, scope, data);
  if ("error" in assignment) return jsonError(assignment.error, assignment.status);

  if (data.phone.trim() !== existing.phone) {
    const phoneTaken = await prisma.user.findFirst({
      where: { churchId: existing.churchId, phone: data.phone.trim(), NOT: { id: existing.id } },
      select: { id: true },
    });
    if (phoneTaken) return jsonError("رقم التليفون مستخدم بالفعل", 409);
  }

  const newPassword = data.regenerateCredentials ? generateInitialPassword() : null;

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address?.trim() || null,
      grade: data.grade?.trim() || assignment.phaseName,
      phaseId: assignment.phaseId,
      classId: assignment.classId,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      confessionFather: data.confessionFather?.trim() || null,
      fatherJob: data.fatherJob?.trim() || null,
      isMotherWorking: data.isMotherWorking ?? false,
      motherJob: data.isMotherWorking ? data.motherJob?.trim() || null : null,
      ...(data.pin ? { pinHash: await hashPassword(data.pin) } : {}),
      ...(newPassword
        ? { passwordHash: await hashPassword(newPassword), initialPassword: newPassword }
        : {}),
    },
  });

  return jsonOk({
    user: { ...sanitizeUser(user), phaseName: assignment.phaseName },
    initialPassword: newPassword,
  });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(READ_ROLES);
  if (error || !session) return error!;

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف المخدوم مطلوب");

  const scope = await resolveScope(session);
  if (!can(scope.role, "manageStudents")) return jsonError("لا تملك صلاحية حذف المخدومين", 403);

  const existing = await prisma.user.findFirst({ where: { id, role: "STUDENT" } });
  if (!existing || !existing.churchId) return jsonError("المخدوم غير موجود", 404);
  if (scope.role !== "SUPER_ADMIN" && existing.churchId !== scope.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }
  if (!isPhaseInScope(scope, existing.phaseId)) return jsonError("لا تملك صلاحية على هذا المخدوم", 403);

  await prisma.user.delete({ where: { id: existing.id } });
  return jsonOk({ ok: true, id: existing.id });
}

