import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function parseBody<T>(schema: ZodSchema<T>, data: unknown): { data: T; error: null } | { data: null; error: NextResponse } {
  try {
    return { data: schema.parse(data), error: null };
  } catch (e) {
    if (e instanceof ZodError) {
      const msg = e.errors.map((x) => x.message).join(" — ") || "بيانات غير صحيحة";
      return { data: null, error: jsonError(msg, 400) };
    }
    return { data: null, error: jsonError("بيانات غير صحيحة", 400) };
  }
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
