import { describe, expect, it } from "vitest";

import { classifyAgentError } from "./AgentErrorCard";

describe("classifyAgentError", () => {
  it("maps 401 / unauthorized to authentication failure", () => {
    const a = classifyAgentError("Unauthorized: missing or invalid AGENT_INTERNAL_TOKEN");
    expect(a.code).toBe("401");
    expect(a.title).toMatch(/身份|鉴权|校验/);

    const b = classifyAgentError("HTTP 401");
    expect(b.code).toBe("401");
  });

  it("maps 403 / forbidden to authorization failure without conflating 401", () => {
    const a = classifyAgentError("403 Forbidden");
    expect(a.code).toBe("403");

    const b = classifyAgentError("permission denied by gateway");
    expect(b.code).toBe("403");

    const c = classifyAgentError("Unauthorized");
    expect(c.code).toBe("401");
    expect(c.code).not.toBe("403");
  });

  it("maps cancelled or timed-out BFF errors before generic 5xx", () => {
    const a = classifyAgentError("agent-service 请求已取消或超时 (requestId: abc)");
    expect(a.code).toBe("TIMEOUT");
    expect(a.advice).toMatch(/120/);
    expect(a.retryLabel).toMatch(/重试/);
    expect(a.raw).toMatch(/取消或超时/);
  });
});
