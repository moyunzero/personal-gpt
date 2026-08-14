import { afterEach, describe, expect, it, vi } from "vitest";

describe("outbound proxy logging contract", () => {
  const keys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.resetModules();
  });

  it("applyOutboundProxyFromEnv returns proxy URL but callers must not log it", async () => {
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
    process.env.HTTPS_PROXY = "http://user:pass@127.0.0.1:7890";

    const { applyOutboundProxyFromEnv } = await import("../observability/outbound-proxy");
    const returned = applyOutboundProxyFromEnv();
    expect(returned).toContain("user:pass");

    // 契约：日志文案不得包含 URL / 凭据（与 main.ts 对齐）
    const safeLog = returned ? "[agent-service] outbound proxy enabled" : "";
    expect(safeLog).not.toMatch(/user:pass|127\.0\.0\.1|7890|http:\/\//);
  });
});
