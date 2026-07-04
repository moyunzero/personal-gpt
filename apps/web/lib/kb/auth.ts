import { NextResponse } from "next/server";

/**
 * KB API 鉴权：设 KB_ADMIN_TOKEN 时要求 Bearer token；未设则放行（本地 dev / E2E）。
 */
export function assertKbAuth(req: Request): NextResponse | null {
  const expected = process.env.KB_ADMIN_TOKEN;
  if (!expected) return null;

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
