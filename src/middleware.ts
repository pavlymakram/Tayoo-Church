import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "tayoo_session";

async function getRole(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    const role = String(payload.role || "");
    // Databases created before the RBAC migration stored servants as `SERVANT`.
    return role === "SERVANT" ? "PHASE_SERVANT" : role;
  } catch {
    return null;
  }
}

/**
 * Route guards for the five roles:
 * SUPER_ADMIN → /super-admin · CHURCH_ADMIN → /admin ·
 * PHASE_ADMIN | PHASE_SERVANT → /servant · STUDENT → /student.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);

  if (pathname.startsWith("/student")) {
    if (role !== "STUDENT") return NextResponse.redirect(new URL(role ? "/" : "/auth/login", req.url));
  }

  if (pathname.startsWith("/servant")) {
    if (!role) return NextResponse.redirect(new URL("/admin121210", req.url));
    if (role === "STUDENT") return NextResponse.redirect(new URL("/student/dashboard", req.url));
    if (role === "SUPER_ADMIN") return NextResponse.redirect(new URL("/super-admin/tenants", req.url));
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "CHURCH_ADMIN") return NextResponse.redirect(new URL(role ? "/" : "/admin121210", req.url));
  }
  if (pathname.startsWith("/super-admin")) {
    if (role !== "SUPER_ADMIN") return NextResponse.redirect(new URL(role ? "/" : "/admin121210", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/servant/:path*", "/admin/:path*", "/super-admin/:path*"],
};
