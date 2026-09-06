import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 页面：仅知识库需登录；首页对话允许游客 */
const PROTECTED_PAGE_PREFIXES = ["/kb"];

/** API：知识库 / Agent / 工作区 / 会话历史需登录；POST /api/chat 允许游客 */
const PROTECTED_API_PREFIXES = [
  "/api/kb",
  "/api/agent",
  "/api/workspace",
  "/api/chat/sessions",
];

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/api/chat") {
    // 试用对话开放；会话历史仍走 /api/chat/sessions
    return false;
  }
  if (
    PROTECTED_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
