import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth",
  "/api/setup",
  // Shopify calls our callback from their server — no user session
  "/api/shopify/callback",
  // Cron jobs use bearer-token auth, not user session
  "/api/cron",
  "/_next",
  "/favicon.ico",
];

const ADMIN_PATHS = ["/settings", "/api/settings", "/admin", "/api/users"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (req.auth.user?.role !== "ADMIN") {
      return new NextResponse("Forbidden — admin only", { status: 403 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
