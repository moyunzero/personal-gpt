import { NextResponse } from "next/server";

import { auth } from "@/auth";

const PROTECTED_PAGE_PREFIXES = ["/", "/kb"];
const PROTECTED_API_PREFIXES = ["/api/chat", "/api/kb", "/api/agent"];

function isProtectedPath(pathname: string): boolean {
  if (PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (pathname === "/" || pathname.startsWith("/kb")) {
    return true;
  }
  if (PROTECTED_PAGE_PREFIXES.includes(pathname)) {
    return true;
  }
  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth?.user?.id) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signIn = new URL("/api/auth/signin", req.nextUrl.origin);
    signIn.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/kb/:path*", "/api/chat", "/api/kb/:path*", "/api/agent/:path*"],
};
