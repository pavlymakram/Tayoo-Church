import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { eventTypeSchema } from "@/lib/validators";

export async function GET() {
  const { session, error } = await requireSession([
    "STUDENT",
    "PHASE_SERVANT",
    "PHASE_ADMIN",
    "CHURCH_ADMIN",
    "SUPER_ADMIN",
  ]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const events = await prisma.eventType.findMany({
    where: {
      churchId: session.churchId,
      ...(session.role === "STUDENT" ? { isActive: true } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return jsonOk({ events });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(eventTypeSchema, body);
  if (parsed.error) return parsed.error;

  const event = await prisma.eventType.create({
    data: {
      churchId: session.churchId,
      title: parsed.data.title.trim(),
      defaultPoints: parsed.data.defaultPoints,
      isActive: parsed.data.isActive ?? true,
    },
  });

  return jsonOk({ event }, 201);
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const body = await readJson(req);
  if (!body || !body.id) return jsonError("معرف المناسبة مطلوب");

  const existing = await prisma.eventType.findFirst({
    where: { id: body.id, churchId: session.churchId },
  });
  if (!existing) return jsonError("المناسبة غير موجودة", 404);

  const event = await prisma.eventType.update({
    where: { id: existing.id },
    data: {
      ...(typeof body.title === "string" ? { title: body.title.trim() } : {}),
      ...(typeof body.defaultPoints === "number" ? { defaultPoints: body.defaultPoints } : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    },
  });

  return jsonOk({ event });
}
