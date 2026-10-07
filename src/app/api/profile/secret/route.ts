import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, parseBody, readJson } from "@/lib/api";
import { hashPassword, requireSession, verifyPassword } from "@/lib/auth";
import { changePinSchema } from "@/lib/validators";
import { normalizeRole } from "@/lib/utils";

/**
 * Profile settings — every account owns exactly ONE secret: the الرقم السري (PIN).
 * Staff rotate their PIN (clearing the stored initial password),
 * students rotate their 4–8 digit PIN.
 */
export async function POST(req: Request) {
  const { session, error } = await requireSession();
  if (error || !session) return error!;

  const body = await readJson(req);
  if (!body) return jsonError("طلب غير صالح");

  const parsed = parseBody(changePinSchema, body.kind === "password" ? remapLegacyPassword(body) : body);
  if (parsed.error) return parsed.error;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return jsonError("المستخدم غير موجود", 404);

  const role = normalizeRole(user.role);
  const currentOk =
    (user.pinHash && (await verifyPassword(parsed.data.currentPin, user.pinHash))) ||
    (user.passwordHash && (await verifyPassword(parsed.data.currentPin, user.passwordHash)));
  if (!currentOk) {
    return jsonError(role === "STUDENT" ? "الرقم السري الحالي غير صحيح" : "كلمة المرور الحالية غير صحيحة", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPassword(parsed.data.newPin),
      passwordHash: await hashPassword(parsed.data.newPin),
      // The auto-generated password is retired once the owner chooses their own PIN.
      initialPassword: null,
    },
  });

  return jsonOk({ ok: true, kind: "pin" });
}

/** Older clients still post `{ kind: "password", currentSecret, newSecret }` — accept them. */
function remapLegacyPassword(body: Record<string, unknown>) {
  return {
    currentPin: typeof body.currentSecret === "string" ? body.currentSecret : body.currentPin,
    newPin: typeof body.newSecret === "string" ? body.newSecret : body.newPin,
  };
}
