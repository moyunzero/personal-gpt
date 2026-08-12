/**
 * Phase 2 regression #3 — 可见 todo / 步骤事件。
 * 期望：SSE 含 todo-update / agent-step（或等价 data part）。
 * 后续 02-04 填绿；禁止 live LLM。
 *
 * Mock 目标（填绿时）：
 * - apps/agent-service/src/graph/build-graph.ts
 * - apps/agent-service/src/agent/* SSE bridge
 */
import { describe, expect, it } from "vitest";

describe("Phase 2 regression #3: visible todo and agent-step events", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it.todo("emits todo-update parts during multi-agent research task");
  it.todo("emits agent-step events for Supervisor / worker handoffs");
});
