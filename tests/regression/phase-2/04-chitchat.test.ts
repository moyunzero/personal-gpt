/**
 * Phase 2 regression #4 — 闲聊不启全图（D-03 / D-17）。
 * 期望：Agent 模式下「今天天气怎么样」走图内轻量短路，不全量 Supervisor+Workers。
 * 后续 02-01 填绿；禁止 live LLM。
 *
 * Mock 目标（填绿时）：
 * - apps/agent-service/src/graph/build-graph.ts（短路节点 / 规则）
 * - 断言未调用 web_search / 多 worker tools
 */
import { describe, expect, it } from "vitest";

describe("Phase 2 regression #4: chitchat skips full multi-agent graph (D-03/D-17)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it.todo("short-circuits 今天天气怎么样 without full Supervisor hub-and-spoke");
  it.todo("does not invoke web_search or multi-worker tools on chitchat");
});
