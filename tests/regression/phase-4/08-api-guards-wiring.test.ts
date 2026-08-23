/**
 * Phase 4 regression #8 — runApiGuards wiring: audit + rate limit (PROD-04 / D-35–D-38).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.ASTRA_DB_COLLECTION = "test_collection";
  process.env.ASTRA_DB_API_ENDPOINT = "https://test.example.com";
  process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test_key";
  process.env.GROQ_API_KEY = "test_groq_key";
  process.env.NIM_API_KEY = "test_nim_key";
});

const finalizeApiAuditMock = vi.fn();
const checkUserRateLimitMock = vi.fn();

vi.mock("@/lib/middleware/audit", () => ({
  finalizeApiAudit: (...args: unknown[]) => finalizeApiAuditMock(...args),
}));

vi.mock("@/lib/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ratelimit")>();
  return {
    ...actual,
    checkUserRateLimit: (...args: unknown[]) => checkUserRateLimitMock(...args),
  };
});

import { runApiGuards } from "@/lib/middleware/api-guards";

const GUARD_CTX = {
  userId: "user-1",
  workspaceId: "ws-1",
  requestId: "req-1",
};

const REQ = new Request("https://example.com/api/chat", { method: "POST" });

describe("Phase 4 regression #8: runApiGuards wiring", () => {
  beforeEach(() => {
    finalizeApiAuditMock.mockReset();
    checkUserRateLimitMock.mockReset();
    checkUserRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
  });

  it("calls finalizeApiAudit with statusCode 200 on successful handler", async () => {
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));

    const res = await runApiGuards(REQ, GUARD_CTX, handler, "chat");

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(finalizeApiAuditMock).toHaveBeenCalledOnce();
    expect(finalizeApiAuditMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        method: "POST",
        path: "/api/chat",
        userId: "user-1",
        workspaceId: "ws-1",
        requestId: "req-1",
        statusCode: 200,
      }),
    );
  });

  it("calls finalizeApiAudit with statusCode 429 when checkUserRateLimit fails", async () => {
    checkUserRateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });

    const handler = vi.fn(async () => new Response("ok", { status: 200 }));

    const res = await runApiGuards(REQ, GUARD_CTX, handler, "chat");

    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(finalizeApiAuditMock).toHaveBeenCalledOnce();
    expect(finalizeApiAuditMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        method: "POST",
        path: "/api/chat",
        userId: "user-1",
        workspaceId: "ws-1",
        requestId: "req-1",
        statusCode: 429,
      }),
    );
    const body = (await res.json()) as { retryAfter: number; error: string };
    expect(body.retryAfter).toBe(30);
  });

  it("invokes finalizeApiAudit exactly once per guarded request", async () => {
    await runApiGuards(REQ, GUARD_CTX, async () => new Response(null, { status: 201 }), "chat");
    expect(finalizeApiAuditMock).toHaveBeenCalledTimes(1);

    finalizeApiAuditMock.mockClear();
    checkUserRateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });
    await runApiGuards(REQ, GUARD_CTX, async () => new Response("ok"), "chat");
    expect(finalizeApiAuditMock).toHaveBeenCalledTimes(1);
  });
});
