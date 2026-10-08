import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { hashPassword, requireSession } from "@/lib/auth";
import { allocateUsername, buildUsername, randomDigits } from "@/lib/credentials";
import { phaseDefinitionForGrade } from "@/lib/phases";
import { isPhaseInScope, resolveScope } from "@/lib/scope";

const MAX_ROWS = 500;

type ImportRow = {
  fullName?: unknown;
  phone?: unknown;
  secondaryPhone?: unknown;
  address?: unknown;
  /** المرحلة — Arabic phase name or abbreviation code. */
  stage?: unknown;
  /** الفصل — class name inside the stage; auto-created when missing. */
  className?: unknown;
  birthDate?: unknown;
  fatherJob?: unknown;
  motherJob?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/**
 * Bulk Excel student import — PHASE ADMINS (أدمن القطاع) ONLY.
 *
 * The client parses the .xlsx/.xls workbook and posts normalized rows:
 * fullName / phone / secondaryPhone / address / stage / className /
 * birthDate / fatherJob / motherJob.
 *
 * Each created student gets a unique username ({church}_user_XXXXX) plus a
 * 4-digit PIN (login + distributable initial password), and is assigned to
 * the matching Stage (Phase) and Class relations — strictly inside the
 * importer's assigned sector. All other roles
 * (SUPER_ADMIN / CHURCH_ADMIN / PHASE_SERVANT / STUDENT) are rejected.
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession(["PHASE_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const churchId = session.churchId;

  // PHASE_ADMIN imports are confined to their assigned sector scope.
  const scope = await resolveScope(session);
  if (scope.role !== "PHASE_ADMIN" || scope.unassigned || scope.phaseIds.length === 0) {
    return jsonError("الاستيراد متاح لأدمن القطاع المعيَّن على قطاع فقط", 403);
  }

  const body = await readJson(req);
  const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : null;
  if (!rows || rows.length === 0) return jsonError("لا توجد صفوف للاستيراد");
  if (rows.length > MAX_ROWS) return jsonError(`الحد الأقصى ${MAX_ROWS} طالب في المرة الواحدة`);

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { id: true, abbreviation: true },
  });
  if (!church) return jsonError("الكنيسة غير موجودة", 404);

  const phases = await prisma.phase.findMany({
    where: { churchId, id: { in: scope.phaseIds } },
    select: { id: true, name: true, abbreviation: true },
  });
  const classes = await prisma.class.findMany({
    where: { churchId },
    select: { id: true, name: true, phaseId: true },
  });
  const classMap = new Map(classes.map((c) => [`${c.phaseId}::${c.name.trim()}`, c]));

  const existingPhones = new Set(
    (await prisma.user.findMany({ where: { churchId }, select: { phone: true } })).map((u) =>
      u.phone.trim()
    )
  );
  const seenPhones = new Set<string>();

  const created: {
    fullName: string;
    username: string;
    password: string;
    phaseName: string;
    className: string | null;
  }[] = [];
  const skipped: { row: number; reason: string }[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const r = rows[index] ?? {};
    const rowNo = index + 1;
    const fullName = str(r.fullName);
    const phone = str(r.phone);

    if (fullName.length < 3) {
      skipped.push({ row: rowNo, reason: "الاسم الرباعي مطلوب" });
      continue;
    }
    if (phone.length < 8) {
      skipped.push({ row: rowNo, reason: `رقم التليفون غير صالح (${fullName})` });
      continue;
    }
    if (existingPhones.has(phone) || seenPhones.has(phone)) {
      skipped.push({ row: rowNo, reason: `الرقم مسجّل بالفعل (${phone})` });
      continue;
    }

    // Auto-assign stage: match spreadsheet المرحلة to a Phase record.
    const stageRaw = str(r.stage);
    const stageLower = stageRaw.toLowerCase();
    let phase =
      phases.find((p) => p.name.trim() === stageRaw) ??
      phases.find((p) => p.name.trim().toLowerCase() === stageLower) ??
      phases.find((p) => p.abbreviation.toLowerCase() === stageLower) ??
      null;
    if (!phase && stageRaw) {
      const definition = phaseDefinitionForGrade(stageRaw);
      if (definition) phase = phases.find((p) => p.abbreviation === definition.abbreviation) ?? null;
    }
    if (!phase) {
      skipped.push({ row: rowNo, reason: `المرحلة غير موجودة: ${stageRaw || "—"}` });
      continue;
    }
    // Sector confinement: reject any stage outside the admin's assigned sector.
    if (!isPhaseInScope(scope, phase.id)) {
      skipped.push({ row: rowNo, reason: `المرحلة خارج قطاعك: ${phase.name}` });
      continue;
    }

    // Auto-assign class: match الفصل inside the stage, create when missing.
    let classId: string | null = null;
    const classRaw = str(r.className);
    if (classRaw) {
      const key = `${phase.id}::${classRaw}`;
      let cls = classMap.get(key) ?? null;
      if (!cls) {
        try {
          cls = await prisma.class.create({
            data: { churchId, phaseId: phase.id, name: classRaw },
            select: { id: true, name: true, phaseId: true },
          });
          classMap.set(key, cls);
        } catch {
          cls =
            (await prisma.class.findFirst({
              where: { churchId, phaseId: phase.id, name: classRaw },
              select: { id: true, name: true, phaseId: true },
            })) ?? null;
          if (cls) classMap.set(key, cls);
        }
      }
      classId = cls?.id ?? null;
    }

    let birthDate: Date | null = null;
    const birthRaw = str(r.birthDate);
    if (birthRaw) {
      const parsed = new Date(birthRaw);
      if (!Number.isNaN(parsed.getTime())) birthDate = parsed;
    }

    // Auto-generate credentials: unique username + 4-digit PIN.
    const pin = randomDigits(4);
    let username: string;
    try {
      username = await allocateUsername(
        () => buildUsername({ churchAbbreviation: church.abbreviation, role: "STUDENT" }),
        async (candidate) =>
          !!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))
      );
    } catch {
      skipped.push({ row: rowNo, reason: `تعذر توليد اسم مستخدم (${fullName})` });
      continue;
    }

    const secondaryPhone = str(r.secondaryPhone) || null;
    const address = str(r.address) || null;
    const fatherJob = str(r.fatherJob) || null;
    const motherJob = str(r.motherJob) || null;

    try {
      await prisma.user.create({
        data: {
          churchId,
          role: "STUDENT",
          fullName,
          username,
          // The 4-digit PIN doubles as the distributable initial password so
          // the exported sheet hands both login fields to the student at once.
          initialPassword: pin,
          passwordHash: await hashPassword(pin),
          pinHash: await hashPassword(pin),
          phone,
          secondaryPhone,
          address,
          grade: phase.name,
          phaseId: phase.id,
          classId,
          birthDate,
          fatherJob,
          motherJob,
          isMotherWorking: !!motherJob,
          createdById: session.userId,
        },
      });
      seenPhones.add(phone);
      existingPhones.add(phone);
      created.push({ fullName, username, password: pin, phaseName: phase.name, className: classRaw || null });
    } catch {
      skipped.push({ row: rowNo, reason: `تعذر حفظ (${fullName})` });
    }
  }

  return jsonOk(
    {
      summary: { total: rows.length, created: created.length, skipped: skipped.length },
      created,
      skipped,
    },
    201
  );
}

