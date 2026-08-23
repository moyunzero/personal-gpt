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

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
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

  const response = NextResponse.next();
  if (isApiPath(pathname)) {
    response.headers.set("x-request-start", String(Date.now()));
    response.headers.set("x-audit-path", pathname);
    response.headers.set("x-audit-method", req.method);
    if (req.auth.user.id) {
      response.headers.set("x-audit-user-id", req.auth.user.id);
    }
    const workspaceId = req.auth.user.activeWorkspaceId;
    if (workspaceId) {
      response.headers.set("x-audit-workspace-id", workspaceId);
    }
  }
  return response;
});

export const config = {
  matcher: [
    "/",
    "/kb/:path*",
    "/api/chat",
    "/api/chat/:path*",
    "/api/kb/:path*",
    "/api/agent/:path*",
  ],
};
