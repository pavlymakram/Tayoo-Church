import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession, type SessionPayload } from "@/lib/auth";
import { generateInitialPassword } from "@/lib/credentials";
import { can } from "@/lib/permissions";
import { createStaffAccount } from "@/lib/provision";
import { sanitizeUser } from "@/lib/sanitize";
import { isPhaseInScope, resolveScope, type AccessScope } from "@/lib/scope";
import { staffUpsertSchema } from "@/lib/validators";

/**
 * Unified servant management.
 *
 * Replaces the former "servant addition" + "access code management" split with one
 * table holding full personal data, role, stage/sector assignment, class assignment,
 * the auto-generated username and the first-issued password.
 */
const STAFF_ROLES = ["CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"];
type StaffRole = "CHURCH_ADMIN" | "PHASE_ADMIN" | "PHASE_SERVANT";

const staffInclude = {
  phase: { select: { id: true, name: true, abbreviation: true, sector: true } },
  classRoom: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;

type StaffRow = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

function toRow(user: StaffRow) {
  return {
    ...sanitizeUser(user),
    phaseName: user.phase?.name ?? null,
    phaseAbbreviation: user.phase?.abbreviation ?? null,
    className: user.classRoom?.name ?? null,
  };
}

/** SUPER_ADMIN passes an explicit church id; everyone else is tenant-locked. */
async function resolveChurchId(session: SessionPayload, requested?: string | null) {
  if (session.role === "SUPER_ADMIN") {
    const churchId = typeof requested === "string" ? requested.trim() : "";
    if (!churchId) return null;
    return (await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } }))?.id ?? null;
  }
  return session.churchId;
}

function canCreateRole(role: StaffRole, scope: AccessScope) {
  if (role === "CHURCH_ADMIN") return can(scope.role, "manageChurchAdmins");
  if (role === "PHASE_ADMIN") return can(scope.role, "managePhaseAdmins");
  return can(scope.role, "managePhaseServants");
}

function isStaffInScope(member: StaffRow, scope: AccessScope) {
  if (scope.churchWide) return true;
  if (!scope.sector) return false;
  if (member.role === "PHASE_ADMIN") return member.sector === scope.sector;
  if (member.phaseId) return scope.phaseIds.includes(member.phaseId);
  return false;
}

export async function GET(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = await resolveChurchId(session, searchParams.get("churchId"));
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }

  const q = searchParams.get("q")?.trim().toLowerCase();
  const role = searchParams.get("role")?.trim();
  const phaseId = searchParams.get("phaseId")?.trim();
  const classId = searchParams.get("classId")?.trim();

  const [staff, phases, classes, me] = await Promise.all([
    prisma.user.findMany({
      where: { churchId, role: { in: STAFF_ROLES } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: staffInclude,
    }),
    prisma.phase.findMany({
      where: { churchId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, abbreviation: true, sector: true, sectorAbbreviation: true },
    }),
    prisma.class.findMany({
      where: { churchId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phaseId: true },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { isFirstAdmin: true, sector: true, phaseId: true },
    }),
  ]);

  const visiblePhases = scope.churchWide ? phases : phases.filter((p) => scope.phaseIds.includes(p.id));

  const rows = staff
    .filter((member) => isStaffInScope(member, scope))
    .filter((member) => (q ? member.fullName.toLowerCase().includes(q) || member.phone.includes(q) || (member.username ?? "").includes(q) : true))
    .filter((member) => (role && role !== "ALL" ? member.role === role : true))
    .filter((member) => (phaseId ? member.phaseId === phaseId : true))
    .filter((member) => (classId ? member.classId === classId : true))
    .map(toRow);

  return jsonOk({
    staff: rows,
    phases: visiblePhases,
    classes: classes.filter((c) => visiblePhases.some((p) => p.id === c.phaseId)),
    me: {
      role: scope.role,
      isFirstAdmin: !!me?.isFirstAdmin,
      sector: me?.sector ?? null,
      phaseId: me?.phaseId ?? null,
      canManageChurchAdmins: can(scope.role, "manageChurchAdmins"),
      canManagePhaseAdmins: can(scope.role, "managePhaseAdmins"),
      canManagePhaseServants: can(scope.role, "managePhaseServants"),
    },
  });
}


type Assignment = {
  sector: string | null;
  phaseId: string | null;
  phaseAbbreviation: string | null;
  classId: string | null;
};

/** Validates stage/sector/class alignment against the caller's scope. */
async function resolveAssignment(
  churchId: string,
  scope: AccessScope,
  role: StaffRole,
  input: { sector?: string | null; phaseId?: string | null; classId?: string | null }
): Promise<{ error: string; status: number } | { assignment: Assignment }> {
  const assignment: Assignment = { sector: null, phaseId: null, phaseAbbreviation: null, classId: null };

  if (role === "PHASE_ADMIN") {
    if (!input.sector) return { error: "اختر القطاع لأدمن القطاع", status: 400 };
    if (!scope.churchWide && input.sector !== scope.sector) {
      return { error: "لا تملك صلاحية على هذا القطاع", status: 403 };
    }
    assignment.sector = input.sector;
  }

  if (role === "PHASE_SERVANT") {
    if (!input.phaseId) return { error: "اختر المرحلة للخادم", status: 400 };
    const phase = await prisma.phase.findFirst({
      where: { id: input.phaseId, churchId },
      select: { id: true, abbreviation: true },
    });
    if (!phase) return { error: "المرحلة غير موجودة", status: 404 };
    if (!isPhaseInScope(scope, phase.id)) return { error: "لا تملك صلاحية على هذه المرحلة", status: 403 };
    assignment.phaseId = phase.id;
    assignment.phaseAbbreviation = phase.abbreviation;
  }

  if (input.classId) {
    const target = await prisma.class.findFirst({
      where: { id: input.classId, churchId },
      select: { id: true, phaseId: true },
    });
    if (!target) return { error: "الفصل غير موجود", status: 404 };
    if (!isPhaseInScope(scope, target.phaseId)) return { error: "لا تملك صلاحية على هذا الفصل", status: 403 };
    if (assignment.phaseId && target.phaseId !== assignment.phaseId) {
      return { error: "الفصل لا يتبع المرحلة المختارة", status: 400 };
    }
    assignment.classId = target.id;
  }

  return { assignment };
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(staffUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;
  const role = data.role as StaffRole;

  const churchId = await resolveChurchId(session, typeof body.churchId === "string" ? body.churchId : null);
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (!canCreateRole(role, scope)) return jsonError("لا تملك صلاحية إضافة هذا الدور", 403);

  const phoneTaken = await prisma.user.findFirst({
    where: { phone: data.phone.trim() },
    select: { id: true },
  });
  if (phoneTaken) return jsonError("هذا الرقم مسجّل بالفعل على المنصة", 409);

  const resolved = await resolveAssignment(churchId, scope, role, data);
  if ("error" in resolved) return jsonError(resolved.error, resolved.status);

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { abbreviation: true },
  });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  const created = await createStaffAccount(prisma, {
    churchId,
    churchAbbreviation: church.abbreviation,
    role,
    fullName: data.fullName,
    phone: data.phone,
    email: data.email || null,
    secondaryPhone: data.secondaryPhone ?? null,
    address: data.address ?? null,
    sector: resolved.assignment.sector,
    phaseId: resolved.assignment.phaseId,
    phaseAbbreviation: resolved.assignment.phaseAbbreviation,
    classId: resolved.assignment.classId,
    // Only the first church admin created with the church holds the privilege.
    isFirstAdmin: false,
    createdById: session.userId,
  });

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: created.user.id },
    include: staffInclude,
  });

  return jsonOk(
    {
      staff: toRow(row),
      username: created.user.username,
      initialPassword: created.initialPassword,
    },
    201
  );
}


export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body?.id) return jsonError("معرف الخادم مطلوب");
  const parsed = parseBody(staffUpsertSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;
  const role = data.role as StaffRole;

  const existing = await prisma.user.findFirst({
    where: { id: body.id, role: { in: STAFF_ROLES } },
    include: staffInclude,
  });
  if (!existing || !existing.churchId) return jsonError("الخادم غير موجود", 404);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== existing.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }
  if (!isStaffInScope(existing, scope)) return jsonError("لا تملك صلاحية على هذا الحساب", 403);
  if (!canCreateRole(role, scope)) return jsonError("لا تملك صلاحية إسناد هذا الدور", 403);
  if (existing.id === session.userId && role !== existing.role) {
    return jsonError("لا يمكنك تغيير دورك بنفسك", 400);
  }

  if (data.phone.trim() !== existing.phone) {
    const phoneTaken = await prisma.user.findFirst({
      where: { phone: data.phone.trim(), NOT: { id: existing.id } },
      select: { id: true },
    });
    if (phoneTaken) return jsonError("رقم التليفون مستخدم بالفعل", 409);
  }

  const resolved = await resolveAssignment(existing.churchId, scope, role, data);
  if ("error" in resolved) return jsonError(resolved.error, resolved.status);

  const newPassword = data.regenerateCredentials ? generateInitialPassword() : null;

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      role,
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      email: data.email || null,
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address?.trim() || null,
      sector: resolved.assignment.sector,
      phaseId: resolved.assignment.phaseId,
      classId: resolved.assignment.classId,
      ...(newPassword
        ? { passwordHash: await hashPassword(newPassword), initialPassword: newPassword }
        : {}),
    },
  });

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: existing.id },
    include: staffInclude,
  });

  return jsonOk({ staff: toRow(row), initialPassword: newPassword });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN"]);
  if (error || !session) return error!;

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("معرف الخادم مطلوب");

  const existing = await prisma.user.findFirst({
    where: { id, role: { in: STAFF_ROLES } },
    select: {
      id: true,
      role: true,
      churchId: true,
      sector: true,
      phaseId: true,
      fullName: true,
      isFirstAdmin: true,
    },
  });
  if (!existing || !existing.churchId) return jsonError("الخادم غير موجود", 404);
  if (existing.id === session.userId) return jsonError("لا يمكنك حذف حسابك", 400);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== existing.churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }

  if (existing.role === "CHURCH_ADMIN") {
    // Only the first-created church admin may delete other church admins; later
    // church admins can neither delete the first admin nor each other.
    const caller = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isFirstAdmin: true, role: true },
    });
    const isSuper = scope.role === "SUPER_ADMIN";
    if (!isSuper && !(caller?.role === "CHURCH_ADMIN" && caller.isFirstAdmin)) {
      return jsonError("حذف أدمن الكنيسة متاح للأدمن الأساسي للكنيسة فقط", 403);
    }
  }

  if (existing.role === "PHASE_ADMIN" && !can(scope.role, "managePhaseAdmins")) {
    return jsonError("حذف أدمن القطاع متاح لأدمن الكنيسة فقط", 403);
  }

  if (existing.role === "PHASE_SERVANT" && !can(scope.role, "managePhaseServants")) {
    return jsonError("لا تملك صلاحية حذف الخدام", 403);
  }

  if (!scope.churchWide) {
    const inScope =
      existing.role === "PHASE_ADMIN"
        ? existing.sector === scope.sector
        : !!existing.phaseId && scope.phaseIds.includes(existing.phaseId);
    if (!inScope) return jsonError("لا تملك صلاحية على هذا الحساب", 403);
  }

  // Attendance records issued by the removed servant are re-attributed to the caller
  // so no point history is lost.
  await prisma.pointTransaction.updateMany({
    where: { churchId: existing.churchId, servantId: existing.id },
    data: { servantId: session.userId },
  });

  await prisma.user.delete({ where: { id: existing.id } });
  return jsonOk({ ok: true, id: existing.id });
}

