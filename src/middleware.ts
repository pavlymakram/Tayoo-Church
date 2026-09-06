import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "tayoo_session";

async function getRole(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    return String(payload.role || "");
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);

  if (pathname.startsWith("/student")) {
    if (!role) return NextResponse.redirect(new URL("/auth/student", req.url));
    if (role !== "STUDENT") return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/servant")) {
    if (!role) return NextResponse.redirect(new URL("/auth/staff", req.url));
    if (role === "STUDENT") return NextResponse.redirect(new URL("/student", req.url));
    if (role === "SUPER_ADMIN") return NextResponse.redirect(new URL("/super-admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/servant/:path*"],
};
