import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { finalizeApiAudit } from "@/lib/middleware/audit";
import { checkUserRateLimit, rateLimitJsonResponse } from "@/lib/ratelimit";

export type ApiGuardContext = {
  userId: string;
  workspaceId: string;
  requestId: string;
};

/** Node route wrapper: userId rate limit + audit trail for /api/* (D-35–D-38, D-36). */
export async function runApiGuards(
  req: NextRequest | Request,
  ctx: ApiGuardContext,
  handler: () => Promise<Response>,
  scope: "chat" | "kb" = "chat",
): Promise<Response> {
  const startedAt = Date.now();
  const path = new URL(req.url).pathname;

  const rl = await checkUserRateLimit(ctx.userId, ctx.requestId, scope);
  if (!rl.success) {
    const blocked = rateLimitJsonResponse(rl);
    await finalizeApiAudit(startedAt, {
      method: req.method,
      path,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      statusCode: 429,
      requestId: ctx.requestId,
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
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      statusCode: 500,
      requestId: ctx.requestId,
    });
    throw err;
  }

  await finalizeApiAudit(startedAt, {
    method: req.method,
    path,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    statusCode: response.status,
    requestId: ctx.requestId,
  });

  return response;
}

export function jsonWithAudit(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}
