import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { checkKbRateLimit, getClientIp } from "@/lib/ratelimit";

import { assertKbAuth } from "./auth";

/** KB 路由统一鉴权 + 限流；通过返回 null */
export async function guardKbRequest(req: Request): Promise<NextResponse | null> {
  const authErr = await assertKbAuth(req);
  if (authErr) return authErr;

  const session = await auth();
  const rateKey = session?.user?.id ?? getClientIp(req);

  const rl = await checkKbRateLimit(rateKey, randomUUID());
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rl.retryAfterSeconds },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
  }

  return null;
}
