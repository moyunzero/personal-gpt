import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import type { ApiGuardContext } from "@/lib/middleware/api-guards";
import { finalizeApiAudit } from "@/lib/middleware/audit";
import { checkUserRateLimit, getClientIp, rateLimitJsonResponse } from "@/lib/ratelimit";

import { assertKbAuth } from "./auth";

/** KB 路由统一鉴权 + userId 限流 + audit（D-35–D-38, D-36/D-37）。 */
export async function runKbGuards(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const path = new URL(req.url).pathname;
  const requestId = randomUUID();

  const authErr = await assertKbAuth(req);
  if (authErr) {
    await finalizeApiAudit(startedAt, {
      method: req.method,
      path,
      statusCode: authErr.status,
      requestId,
    });
    return authErr;
  }

  const session = await auth();
  let guardCtx: ApiGuardContext = {
    userId: session?.user?.id ?? getClientIp(req),
    workspaceId: "",
    requestId,
  };
  if (session?.user?.id) {
    const retrievalCtx = await resolveRetrievalContext(session);
    guardCtx = {
      userId: retrievalCtx.userId,
      workspaceId: retrievalCtx.workspaceId,
      requestId,
    };
  }

  const rl = await checkUserRateLimit(guardCtx.userId, requestId, "kb");
  if (!rl.success) {
    const blocked = rateLimitJsonResponse(rl);
    await finalizeApiAudit(startedAt, {
      method: req.method,
      path,
      userId: session?.user?.id ?? null,
      workspaceId: guardCtx.workspaceId || null,
      statusCode: 429,
      requestId,
    });
    return blocked;
  }

  let response: Response;
  try {
    response = await handler();
  } catch (err) {
    await finalizeApiAudit(startedAt, {
      method: req.method,
      path,
      userId: session?.user?.id ?? null,
      workspaceId: guardCtx.workspaceId || null,
      statusCode: 500,
      requestId,
    });
    throw err;
  }

  await finalizeApiAudit(startedAt, {
    method: req.method,
    path,
    userId: session?.user?.id ?? null,
    workspaceId: guardCtx.workspaceId || null,
    statusCode: response.status,
    requestId,
  });

  return response;
}

/** KB 路由统一鉴权 + 限流；通过返回 null（audit 由 runKbGuards 负责）。 */
export async function guardKbRequest(req: Request): Promise<NextResponse | null> {
  const authErr = await assertKbAuth(req);
  if (authErr) return authErr;

  const session = await auth();
  const rateKey = session?.user?.id ?? getClientIp(req);

  const rl = await checkUserRateLimit(rateKey, randomUUID(), "kb");
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
