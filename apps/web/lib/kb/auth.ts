import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * KB API 鉴权：优先 session（D-22）；保留 KB_ADMIN_TOKEN 供脚本/E2E 回退。
 */
export async function assertKbAuth(req: Request): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user?.id) {
    return null;
  }

  const expected = process.env.KB_ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
