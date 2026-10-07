import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "tayoo_session";

type GuardRole = "STUDENT" | "PHASE_SERVANT" | "PHASE_ADMIN" | "CHURCH_ADMIN" | "SUPER_ADMIN";

const ROLE_HOME: Record<GuardRole, string> = {
  STUDENT: "/student/dashboard",
  PHASE_SERVANT: "/servant/quick-scan",
  PHASE_ADMIN: "/servant",
  CHURCH_ADMIN: "/admin/dashboard",
  SUPER_ADMIN: "/super-admin/tenants",
};

async function getRole(req: NextRequest): Promise<GuardRole | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    const raw = String(payload.role || "");
    const role = (raw === "SERVANT" ? "PHASE_SERVANT" : raw) as GuardRole;
    if (
      role === "STUDENT" ||
      role === "PHASE_SERVANT" ||
      role === "PHASE_ADMIN" ||
      role === "CHURCH_ADMIN" ||
      role === "SUPER_ADMIN"
    ) {
      return role;
    }
    return null;
  } catch {
    return null;
  }
}

function homeFor(role: GuardRole): string {
  return ROLE_HOME[role] ?? "/";
}

function staffHomeFor(role: GuardRole): string {
  if (role === "SUPER_ADMIN") return ROLE_HOME.SUPER_ADMIN;
  if (role === "CHURCH_ADMIN") return ROLE_HOME.CHURCH_ADMIN;
  return "/servant";
}

/**
 * Absolute route isolation:
 * - `/` is the independent student portal. Unauthenticated stays, staff bounce home.
 * - `/admin121210` is the single staff gate. Unauthenticated stays, students bounce
 *   to `/student/dashboard`, staff bounce to their home.
 * - `/student/*` requires STUDENT (unauthenticated -> `/`).
 * - `/servant/*` requires staff (unauthenticated -> `/admin121210`).
 * - `/admin/*` requires CHURCH_ADMIN (unauthenticated -> `/admin121210`).
 * - `/super-admin/*` requires SUPER_ADMIN (unauthenticated -> `/admin121210`).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);

  if (pathname === "/" || pathname.startsWith("/auth/") || pathname === "/login" || pathname.startsWith("/login/")) {
    if (!role) return NextResponse.next();
    if (role === "STUDENT") {
      return NextResponse.redirect(new URL("/student/dashboard", req.url));
    }
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }

  if (pathname === "/admin121210" || pathname.startsWith("/admin121210/")) {
    if (!role) return NextResponse.next();
    if (role === "STUDENT") return NextResponse.redirect(new URL("/student/dashboard", req.url));
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }

  if (pathname.startsWith("/student")) {
    if (!role) return NextResponse.redirect(new URL("/", req.url));
    if (role !== "STUDENT") return NextResponse.redirect(new URL(staffHomeFor(role), req.url));
  }

  if (pathname.startsWith("/servant")) {
    if (!role) return NextResponse.redirect(new URL("/admin121210", req.url));
    if (role === "STUDENT") return NextResponse.redirect(new URL("/", req.url));
    if (role === "SUPER_ADMIN") return NextResponse.redirect(new URL("/super-admin/tenants", req.url));
    if (role === "CHURCH_ADMIN" && pathname.startsWith("/servant/quick-scan")) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!role) return NextResponse.redirect(new URL("/admin121210", req.url));
    if (role !== "CHURCH_ADMIN") {
      if (role === "STUDENT") return NextResponse.redirect(new URL("/", req.url));
      return NextResponse.redirect(new URL(staffHomeFor(role), req.url));
    }
  }
  if (pathname.startsWith("/super-admin")) {
    if (!role) return NextResponse.redirect(new URL("/admin121210", req.url));
    if (role !== "SUPER_ADMIN") {
      if (role === "STUDENT") return NextResponse.redirect(new URL("/", req.url));
      return NextResponse.redirect(new URL(staffHomeFor(role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/auth/:path*", "/login/:path*", "/login", "/admin121210", "/admin121210/:path*", "/student/:path*", "/servant/:path*", "/admin/:path*", "/super-admin/:path*"],
};
