import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { studentRegisterSchema } from "@/lib/validators";
import { sanitizeUser } from "@/lib/sanitize";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const parsed = parseBody(studentRegisterSchema, body);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const church = await prisma.church.findUnique({
    where: { licenseKey: data.churchLicenseKey.trim() },
  });
  if (!church || !church.isActive) {
    return jsonError("مفتاح الترخيص غير صحيح أو الكنيسة غير مفعّلة", 404);
  }

  const existing = await prisma.user.findFirst({
    where: { churchId: church.id, phone: data.phone.trim() },
  });
  if (existing) return jsonError("هذا الرقم مسجّل بالفعل في هذه الكنيسة", 409);

  const user = await prisma.user.create({
    data: {
      churchId: church.id,
      role: "STUDENT",
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || null,
      address: data.address.trim(),
      grade: data.grade,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      confessionFather: data.confessionFather?.trim() || null,
      fatherJob: data.fatherJob?.trim() || null,
      isMotherWorking: data.isMotherWorking ?? false,
      motherJob: data.isMotherWorking ? data.motherJob?.trim() || null : null,
      pinHash: await hashPassword(data.pin),
      qrCodeId: crypto.randomUUID(),
    },
  });

  const token = await createSessionToken({
    userId: user.id,
    churchId: church.id,
    role: "STUDENT",
    fullName: user.fullName,
  });
  await setSessionCookie(token);

  return jsonOk(
    { user: sanitizeUser(user), church: { id: church.id, name: church.name } },
    201
  );
}
