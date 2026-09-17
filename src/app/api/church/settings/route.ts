import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { churchSettingsSchema } from "@/lib/validators";

export async function GET() {
  const { session, error } = await requireSession(["SERVANT", "CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);
  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { defaultMassPoints: true, defaultServicePoints: true } });
  return jsonOk({ settings: church });
}

export async function PATCH(req: Request) {
  const { session, error } = await requireSession(["CHURCH_ADMIN"]);
  if (error || !session) return error!;
  if (!session.churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(churchSettingsSchema, body);
  if (parsed.error) return parsed.error;
  const settings = await prisma.church.update({ where: { id: session.churchId }, data: parsed.data, select: { defaultMassPoints: true, defaultServicePoints: true } });
  return jsonOk({ settings });
}
