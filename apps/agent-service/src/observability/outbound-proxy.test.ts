import { afterEach, describe, expect, it, vi } from "vitest";

describe("outbound proxy logging contract", () => {
  const keys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("logOutboundProxyStatus does not print URL, credentials, host, or port", async () => {
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
    process.env.HTTPS_PROXY = "http://user:pass@127.0.0.1:7890";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { applyOutboundProxyFromEnv, logOutboundProxyStatus } = await import(
      "../observability/outbound-proxy"
    );
    const returned = applyOutboundProxyFromEnv();
    expect(returned).toContain("user:pass");

    logOutboundProxyStatus(returned);
    expect(logSpy).toHaveBeenCalled();
    const captured = logSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(captured).toContain("outbound proxy enabled");
    expect(captured).not.toMatch(/user:pass|127\.0\.0\.1|7890|http:\/\//);
  });
});
