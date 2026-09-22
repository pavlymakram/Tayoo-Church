import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { buildUsername, generateInitialPassword, normalizeAbbreviation } from "../src/lib/credentials";
import { DEFAULT_PHASES, sectorAbbreviation } from "../src/lib/phases";

const prisma = new PrismaClient();

const DEFAULT_EVENTS = [
  { title: "القداس الإلهي", defaultPoints: 5 },
  { title: "حضور الخدمة / مدارس الأحد", defaultPoints: 3 },
  { title: "هدايا وتشجيع", defaultPoints: 0 },
];

function licenseKey() {
  return `TAYOO-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

type SeedRole = "CHURCH_ADMIN" | "PHASE_ADMIN" | "PHASE_SERVANT" | "STUDENT";

async function uniqueUsername(
  churchAbbreviation: string,
  role: SeedRole,
  phaseAbbreviation?: string | null,
  sector?: string | null
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildUsername({ churchAbbreviation, role, phaseAbbreviation, sector });
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error("Unable to allocate a unique username");
}

async function main() {
  const phone = process.env.SUPER_ADMIN_PHONE;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || "مدير النظام";
  const seedDemo = process.env.SEED_DEMO === "true";
  if (!phone || !password || password.length < 16) {
    throw new Error("Set SUPER_ADMIN_PHONE and a unique SUPER_ADMIN_PASSWORD of at least 16 characters.");
  }
  if (seedDemo && process.env.NODE_ENV === "production") {
    throw new Error("Demo seeding is not allowed in production.");
  }

  const existingSuper = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", phone },
  });

  if (!existingSuper) {
    await prisma.user.create({
      data: {
        role: "SUPER_ADMIN",
        fullName: name,
        phone,
        passwordHash: await bcrypt.hash(password, 12),
        churchId: null,
      },
    });
    console.log(`✓ Super admin created: ${phone}`);
  } else {
    console.log("✓ Super admin already exists");
  }

  // Production bootstrap stops here: demo records are local-development only.
  if (!seedDemo) return;

  const abbreviation = normalizeAbbreviation(process.env.SEED_CHURCH_ABBREVIATION || "demo_church");
  let church = await prisma.church.findUnique({ where: { abbreviation } });

  if (!church) {
    church = await prisma.church.create({
      data: {
        name: "كنيسة الملاك ميخائيل (تجريبي)",
        abbreviation,
        licenseKey: licenseKey(),
      },
    });
    console.log(`✓ Demo church: ${church.name} | code: ${church.abbreviation} | key: ${church.licenseKey}`);
  }

  const churchId = church.id;

  await prisma.phase.createMany({
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

  for (const ev of DEFAULT_EVENTS) {
    const exists = await prisma.eventType.findFirst({ where: { churchId, title: ev.title } });
    if (!exists) await prisma.eventType.create({ data: { churchId, ...ev } });
  }

  const prep1 = await prisma.phase.findFirst({ where: { churchId, abbreviation: "prep1" } });
  const prep2 = await prisma.phase.findFirst({ where: { churchId, abbreviation: "prep2" } });
  const prep3 = await prisma.phase.findFirst({ where: { churchId, abbreviation: "prep3" } });

  const existingClass = prep1
    ? await prisma.class.findFirst({ where: { churchId, phaseId: prep1.id, name: "فصل أ" } })
    : null;
  const classA =
    existingClass ??
    (prep1 ? await prisma.class.create({ data: { churchId, phaseId: prep1.id, name: "فصل أ" } }) : null);

  async function seedStaff(input: {
    role: Exclude<SeedRole, "STUDENT">;
    fullName: string;
    phone: string;
    isFirstAdmin?: boolean;
    sector?: string | null;
    phaseId?: string | null;
    phaseAbbreviation?: string | null;
    classId?: string | null;
  }) {
    const existing = await prisma.user.findFirst({ where: { churchId, phone: input.phone } });
    if (existing) {
      console.log(`✓ ${input.fullName} already exists (${existing.username})`);
      return existing;
    }
    const initialPassword = generateInitialPassword();
    const username = await uniqueUsername(church!.abbreviation, input.role, input.phaseAbbreviation, input.sector);
    const created = await prisma.user.create({
      data: {
        churchId,
        role: input.role,
        fullName: input.fullName,
        username,
        initialPassword,
        passwordHash: await bcrypt.hash(initialPassword, 12),
        phone: input.phone,
        address: "القاهرة",
        sector: input.sector ?? null,
        phaseId: input.phaseId ?? null,
        classId: input.classId ?? null,
        isFirstAdmin: input.isFirstAdmin ?? false,
      },
    });
    console.log(`✓ ${input.role}: ${username} / ${initialPassword}`);
    return created;
  }

  const admin = await seedStaff({
    role: "CHURCH_ADMIN",
    fullName: "خادم الخدمة الرئيسي",
    phone: "01111111111",
    isFirstAdmin: true,
  });

  await seedStaff({
    role: "PHASE_ADMIN",
    fullName: "أدمن قطاع إعدادي",
    phone: "01333333333",
    sector: "PREPARATORY",
  });

  await seedStaff({
    role: "PHASE_SERVANT",
    fullName: "خادم أولى إعدادي",
    phone: "01222222222",
    phaseId: prep1?.id ?? null,
    phaseAbbreviation: prep1?.abbreviation ?? null,
    classId: classA?.id ?? null,
  });

  const students = [
    { fullName: "مينا جورج فوزي حنا", phone: "01555555551", phase: prep1, classId: classA?.id ?? null, pin: "1234" },
    { fullName: "مارياد يوسف كمال فريد", phone: "01555555552", phase: prep2, classId: null, pin: "5678" },
    { fullName: "كيرلس سامح نبيل غالي", phone: "01555555553", phase: prep3, classId: null, pin: "9999" },
  ];

  for (const s of students) {
    const exists = await prisma.user.findFirst({ where: { churchId, phone: s.phone } });
    if (exists) continue;

    const initialPassword = generateInitialPassword();
    const username = await uniqueUsername(church.abbreviation, "STUDENT");
    const student = await prisma.user.create({
      data: {
        churchId,
        role: "STUDENT",
        fullName: s.fullName,
        username,
        initialPassword,
        passwordHash: await bcrypt.hash(initialPassword, 12),
        phone: s.phone,
        secondaryPhone: "01099999999",
        grade: s.phase?.name ?? "1 إعدادي",
        phaseId: s.phase?.id ?? null,
        classId: s.classId,
        address: "القاهرة",
        confessionFather: "أبونا بيشوي",
        fatherJob: "مهندس",
        isMotherWorking: true,
        motherJob: "معلمة",
        birthDate: new Date("2012-05-15"),
        pinHash: await bcrypt.hash(s.pin, 12),
      },
    });

    const mass = await prisma.eventType.findFirst({
      where: { churchId, title: "القداس الإلهي" },
    });
    if (mass) {
      // A Friday liturgy record so the attendance log has exact dates to display.
      const friday = new Date();
      friday.setDate(friday.getDate() - ((friday.getDay() + 2) % 7));
      await prisma.pointTransaction.create({
        data: {
          churchId,
          studentId: student.id,
          servantId: admin.id,
          eventTypeId: mass.id,
          pointsAmount: 5,
          note: "حضور قدّاس الجمعة",
          createdAt: friday,
        },
      });
    }
    console.log(`✓ Student: ${s.fullName} | ${username} / ${initialPassword} | PIN ${s.pin}`);
  }

  console.log("\n=== Seed complete ===");
  console.log(`Church code: ${church.abbreviation} | license key: ${church.licenseKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
