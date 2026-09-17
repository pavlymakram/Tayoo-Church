import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const DEFAULT_EVENTS = [
  { title: "القداس الإلهي", defaultPoints: 5 },
  { title: "حضور الخدمة / مدارس الأحد", defaultPoints: 3 },
  { title: "هدايا وتشجيع", defaultPoints: 0 },
];

function licenseKey() {
  return `TAYOO-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
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

  let church = await prisma.church.findFirst({
    where: { name: "كنيسة الملاك ميخائيل (تجريبي)" },
  });

  if (!church) {
    church = await prisma.church.create({
      data: {
        name: "كنيسة الملاك ميخائيل (تجريبي)",
        licenseKey: licenseKey(),
      },
    });
    console.log(`✓ Demo church: ${church.name} | key: ${church.licenseKey}`);
  }

  for (const ev of DEFAULT_EVENTS) {
    const exists = await prisma.eventType.findFirst({
      where: { churchId: church.id, title: ev.title },
    });
    if (!exists) {
      await prisma.eventType.create({
        data: { churchId: church.id, ...ev },
      });
    }
  }

  const adminPhone = "01111111111";
  let admin = await prisma.user.findFirst({
    where: { churchId: church.id, phone: adminPhone },
  });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        churchId: church.id,
        role: "CHURCH_ADMIN",
        fullName: "خادم الخدمة الرئيسي",
        phone: adminPhone,
        passwordHash: await bcrypt.hash("Admin@1234", 12),
        address: "القاهرة",
      },
    });
    console.log(`✓ Church admin: ${adminPhone} / Admin@1234`);
  }

  const servantPhone = "01222222222";
  const servantExists = await prisma.user.findFirst({
    where: { churchId: church.id, phone: servantPhone },
  });
  if (!servantExists) {
    await prisma.user.create({
      data: {
        churchId: church.id,
        role: "SERVANT",
        fullName: "خادم الافتقاد",
        phone: servantPhone,
        passwordHash: await bcrypt.hash("Servant@1234", 12),
        address: "القاهرة",
      },
    });
    console.log(`✓ Servant: ${servantPhone} / Servant@1234`);
  }

  const students = [
    {
      fullName: "مينا جورج فوزي حنا",
      phone: "01555555551",
      grade: "1 إعدادي",
      address: "شارع الكنيسة، القاهرة",
      confessionFather: "أبونا بيشوي",
      fatherJob: "مهندس",
      isMotherWorking: true,
      motherJob: "معلمة",
      pin: "1234",
    },
    {
      fullName: "مارياد يوسف كمال فريد",
      phone: "01555555552",
      grade: "2 إعدادي",
      address: "حي المعادي، القاهرة",
      confessionFather: "أبونا أنطونيوس",
      fatherJob: "طبيب",
      isMotherWorking: false,
      motherJob: null,
      pin: "5678",
    },
    {
      fullName: "كيرلس سامح نبيل غالي",
      phone: "01555555553",
      grade: "3 إعدادي",
      address: "شبرا، القاهرة",
      confessionFather: "أبونا موسى",
      fatherJob: "محاسب",
      isMotherWorking: true,
      motherJob: "صيدلانية",
      pin: "9999",
    },
  ];

  for (const s of students) {
    const exists = await prisma.user.findFirst({
      where: { churchId: church.id, phone: s.phone },
    });
    if (!exists) {
      const student = await prisma.user.create({
        data: {
          churchId: church.id,
          role: "STUDENT",
          fullName: s.fullName,
          phone: s.phone,
          secondaryPhone: "01099999999",
          grade: s.grade,
          address: s.address,
          confessionFather: s.confessionFather,
          fatherJob: s.fatherJob,
          isMotherWorking: s.isMotherWorking,
          motherJob: s.motherJob,
          birthDate: new Date("2012-05-15"),
          pinHash: await bcrypt.hash(s.pin, 12),
        },
      });

      const mass = await prisma.eventType.findFirst({
        where: { churchId: church.id, title: "القداس الإلهي" },
      });
      if (mass && admin) {
        await prisma.pointTransaction.create({
          data: {
            churchId: church.id,
            studentId: student.id,
            servantId: admin.id,
            eventTypeId: mass.id,
            pointsAmount: 5,
            note: "حضور قدّاس الأحد",
          },
        });
      }
      console.log(`✓ Student: ${s.fullName} | PIN ${s.pin}`);
    }
  }

  console.log("\n=== Seed complete ===");
  console.log(`Church license key: ${church.licenseKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
