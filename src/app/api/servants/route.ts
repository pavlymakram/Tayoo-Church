import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession } from "@/lib/auth";
import { createServantSchema } from "@/lib/validators";
import { sanitizeUser } from "@/lib/sanitize";

export async function GET() {
  const { session, error } = await requireSession(["CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const servants = await prisma.user.findMany({
    where: {
      churchId: session.churchId,
      role: { in: ["SERVANT", "CHURCH_ADMIN"] },
    },
    orderBy: { createdAt: "asc" },
  });

  return jsonOk({ servants: servants.map(sanitizeUser) });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(createServantSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { churchId: session.churchId, phone: data.phone.trim() },
  });
  if (existing) return jsonError("هذا الرقم مسجّل بالفعل", 409);

  const servant = await prisma.user.create({
    data: {
      churchId: session.churchId,
      role: data.role,
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      passwordHash: await hashPassword(data.password),
      roleSecurityCodeHash: data.securityCode?.trim() ? await hashPassword(data.securityCode.trim()) : null,
    },
  });

  return jsonOk({ servant: sanitizeUser(servant) }, 201);
}
