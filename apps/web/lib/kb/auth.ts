import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";

function safeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * KB API 鉴权：优先 session（D-22）；保留 KB_ADMIN_TOKEN 供脚本/E2E 回退（恒时比较）。
 */
export async function assertKbAuth(req: Request): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user?.id) {
    return null;
  }

  const expected = process.env.KB_ADMIN_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provided =
    req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? "";
  if (!provided || !safeTokenEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
