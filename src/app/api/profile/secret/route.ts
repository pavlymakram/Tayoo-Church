import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession, verifyPassword } from "@/lib/auth";
import { changePinSchema, changeSecretSchema } from "@/lib/validators";
import { normalizeRole } from "@/lib/utils";

/**
 * Profile settings — account owners rotate their own secrets.
 * Staff change their password (clearing the stored initial password),
 * students change their 4–8 digit PIN.
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession();
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");
  const kind = body.kind === "pin" ? "pin" : "password";

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return jsonError("المستخدم غير موجود", 404);
  const role = normalizeRole(user.role);

  if (kind === "pin") {
    const parsed = parseBody(changePinSchema, body);
    if (parsed.error) return parsed.error;
    if (role !== "STUDENT") return jsonError("تغيير الـ PIN متاح للمخدومين فقط", 403);
    if (!user.pinHash || !(await verifyPassword(parsed.data.currentPin, user.pinHash))) {
      return jsonError("الرقم السري الحالي غير صحيح", 401);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await hashPassword(parsed.data.newPin) },
    });
    return jsonOk({ ok: true, kind });
  }

  const parsed = parseBody(changeSecretSchema, body);
  if (parsed.error) return parsed.error;
  if (!user.passwordHash || !(await verifyPassword(parsed.data.currentSecret, user.passwordHash))) {
    return jsonError("كلمة المرور الحالية غير صحيحة", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newSecret),
      // The auto-generated password is retired once the owner chooses their own.
      initialPassword: null,
    },
  });

  return jsonOk({ ok: true, kind });
}
