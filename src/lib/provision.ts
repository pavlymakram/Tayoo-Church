import type { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "./auth";
import { allocateUsername, buildUsername, generateInitialPassword } from "./credentials";
import { DEFAULT_PHASES, sectorAbbreviation } from "./phases";

type Db = PrismaClient | Prisma.TransactionClient;

/** Every church receives the full documented stage catalogue on creation. */
export async function provisionDefaultPhases(db: Db, churchId: string) {
  await db.phase.createMany({
    data: DEFAULT_PHASES.map((phase) => ({
      churchId,
      name: phase.name,
      abbreviation: phase.abbreviation,
      sector: phase.sector,
      sectorAbbreviation: sectorAbbreviation(phase.sector)!,
      sortOrder: phase.sortOrder,
    })),
    skipDuplicates: true,
  });
}

export async function provisionDefaultEventTypes(db: Db, churchId: string) {
  const templates = [
    { title: "القداس الإلهي", defaultPoints: 5 },
    { title: "حضور الخدمة / مدارس الأحد", defaultPoints: 3 },
    { title: "هدايا وتشجيع", defaultPoints: 0 },
  ];
  await db.eventType.createMany({
    data: templates.map((t) => ({ churchId, title: t.title, defaultPoints: t.defaultPoints })),
    skipDuplicates: true,
  });
}

export type StaffAccountInput = {
  churchId: string;
  churchAbbreviation: string;
  role: "CHURCH_ADMIN" | "PHASE_ADMIN" | "PHASE_SERVANT";
  fullName: string;
  phone: string;
  email?: string | null;
  secondaryPhone?: string | null;
  address?: string | null;
  sector?: string | null;
  phaseAbbreviation?: string | null;
  phaseId?: string | null;
  classId?: string | null;
  isFirstAdmin?: boolean;
  createdById?: string | null;
};

/**
 * Creates a staff account with an auto-generated username and initial password.
 * The plaintext password is hashed for login and also kept in `initialPassword`
 * so the creating admin can hand it over; it is wiped when the owner changes it.
 */
export async function createStaffAccount(db: Db, input: StaffAccountInput) {
  const initialPassword = generateInitialPassword();
  const username = await allocateUsername(
    () =>
      buildUsername({
        churchAbbreviation: input.churchAbbreviation,
        role: input.role,
        phaseAbbreviation: input.phaseAbbreviation,
        sector: input.sector,
      }),
    async (candidate) => !!(await db.user.findUnique({ where: { username: candidate }, select: { id: true } }))
  );

  const user = await db.user.create({
    data: {
      churchId: input.churchId,
      role: input.role,
      fullName: input.fullName.trim(),
      username,
      initialPassword,
      passwordHash: await hashPassword(initialPassword),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      secondaryPhone: input.secondaryPhone?.trim() || null,
      address: input.address?.trim() || null,
      sector: input.role === "PHASE_ADMIN" ? input.sector ?? null : null,
      phaseId: input.role === "PHASE_SERVANT" ? input.phaseId ?? null : null,
      classId: input.classId ?? null,
      isFirstAdmin: input.isFirstAdmin ?? false,
      createdById: input.createdById ?? null,
    },
  });

  return { user, initialPassword };
}
