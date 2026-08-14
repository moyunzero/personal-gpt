/**
 * 旧 ENG-03 代理 WEB_URL 测试已失效（controller 现为 LangGraph SSE + 可选内部令牌）。
 * 令牌校验见 apps/agent-service/src/agent/internal-token.test.ts。
 */
import { describe, expect, it } from "vitest";

describe("AgentController (legacy proxy suite retired)", () => {
  it("points coverage to internal-token tests", () => {
    expect(true).toBe(true);
  });
});
