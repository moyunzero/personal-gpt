/**
 * Phase 2 regression #1 — 框架对比报告骨架。
 * 期望：todo 步骤 + ≥2 段正文 + ≥1 citation。
 * 后续 02-01～02-04 填绿；禁止 live LLM。
 *
 * Mock 目标（填绿时）：
 * - apps/agent-service/src/graph/build-graph.ts
 * - apps/agent-service/src/tools/*（kb_search / web_search）
 */
import { describe, expect, it } from "vitest";

describe("Phase 2 regression #1: framework compare report", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it.todo("emits todo steps for LangGraph vs AutoGen compare task");
  it.todo("streams at least 2 body paragraphs without live LLM");
  it.todo("includes at least one citation part from mocked retrieval");
});
