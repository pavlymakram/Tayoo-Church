import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import type { Role } from "./utils";

const COOKIE_NAME = "tayoo_session";
const SESSION_DAYS = 30;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  churchId: string | null;
  role: Role;
  fullName: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: String(payload.userId),
      churchId: payload.churchId ? String(payload.churchId) : null,
      role: payload.role as Role,
      fullName: String(payload.fullName),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(roles?: Role[]) {
  const session = await getSession();
  if (!session) {
    return { session: null as SessionPayload | null, error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
  }
  if (roles && !roles.includes(session.role)) {
    return { session: null as SessionPayload | null, error: NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 }) };
  }
  return { session, error: null };
}

/** Enforce church_id isolation — never trust client-supplied churchId for data access */
export function assertChurchAccess(session: SessionPayload, churchId: string | null | undefined) {
  if (session.role === "SUPER_ADMIN") return true;
  if (!session.churchId || !churchId || session.churchId !== churchId) {
    return false;
  }
  return true;
}

export async function getAuthenticatedUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

export { COOKIE_NAME };
