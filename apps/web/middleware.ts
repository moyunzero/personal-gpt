import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_API_PREFIXES = ["/api/chat", "/api/kb", "/api/agent", "/api/workspace"];

function isProtectedPath(pathname: string): boolean {
  if (PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (pathname === "/" || pathname.startsWith("/kb")) {
    return true;
  }
  return false;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("authjs.session-token")?.value ||
      req.cookies.get("__Secure-authjs.session-token")?.value,
  );
}

/** Validate session via Node auth route (Edge cannot use TypeORM adapter). */
async function hasValidSession(req: NextRequest): Promise<boolean> {
  if (!hasSessionCookie(req)) return false;
  const cookie = req.headers.get("cookie");
  if (!cookie) return false;

  try {
    const sessionUrl = new URL("/api/auth/session", req.nextUrl.origin);
    const res = await fetch(sessionUrl, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { user?: { id?: string } | null };
    return Boolean(data?.user?.id);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!(await hasValidSession(req))) {
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
  }
  return response;
}

export const config = {
  matcher: [
    "/",
    "/kb/:path*",
    "/api/chat",
    "/api/chat/:path*",
    "/api/kb/:path*",
    "/api/agent/:path*",
    "/api/workspace",
    "/api/workspace/:path*",
  ],
};
