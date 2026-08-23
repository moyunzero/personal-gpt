/**
 * Phase 4 regression #6 — audit_logs + userId rate limit (PROD-04 / D-35–D-38).
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

const saveMock = vi.fn();
const createMock = vi.fn((row: unknown) => row);

vi.mock("@/lib/db/get-data-source", () => ({
  getDataSource: vi.fn(async () => ({
    getRepository: () => ({
      create: createMock,
      save: saveMock,
    }),
  })),
}));

import {
  auditActionFromRequest,
  sanitizeAuditResource,
  shouldRedactAuditField,
  writeAuditLog,
} from "@/lib/middleware/audit";
import { checkUserRateLimit, rateLimitJsonResponse, resetRateLimitRedisForTests } from "@/lib/ratelimit";

describe("Phase 4 regression #6: audit + rate limit", () => {
  beforeEach(() => {
    saveMock.mockReset();
    createMock.mockClear();
    resetRateLimitRedisForTests();
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("audit action uses method + path without query string", () => {
    expect(auditActionFromRequest("POST", "/api/chat?foo=1")).toBe("POST /api/chat");
    expect(sanitizeAuditResource("/api/kb/documents?limit=10")).toBe("/api/kb/documents");
  });

  it("redacts document/message body fields from audit metadata", () => {
    expect(shouldRedactAuditField("content")).toBe(true);
    expect(shouldRedactAuditField("messages")).toBe(true);
    expect(shouldRedactAuditField("statusCode")).toBe(false);
  });

  it("writes audit_logs row on API call metadata", async () => {
    saveMock.mockResolvedValue({ id: "audit-1" });
    const row = await writeAuditLog({
      method: "GET",
      path: "/api/kb/documents",
      userId: "user-1",
      workspaceId: "ws-1",
      statusCode: 200,
      latencyMs: 12,
      requestId: "req-1",
    });
    expect(row).toEqual({ id: "audit-1" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "GET /api/kb/documents",
        resource: "/api/kb/documents",
        userId: "user-1",
        workspaceId: "ws-1",
        statusCode: 200,
        latencyMs: 12,
      }),
    );
    expect(saveMock).toHaveBeenCalled();
  });

  it("429 response includes retryAfter field (D-38)", async () => {
    const res = rateLimitJsonResponse({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const body = (await res.json()) as { retryAfter: number; error: string };
    expect(body.retryAfter).toBe(30);
    expect(body.error).toMatch(/rate limit/i);
  });

  it("checkUserRateLimit fail-open when Redis unset", async () => {
    const result = await checkUserRateLimit("user-a", "req-a", "chat");
    expect(result.success).toBe(true);
  });
});
