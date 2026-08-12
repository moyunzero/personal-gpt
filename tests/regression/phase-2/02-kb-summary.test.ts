/**
 * Phase 2 regression #2 — KB 总结触发 Retriever。
 * 期望：Retriever Agent 被调用；citation 来自 KB（workspace 过滤）。
 * 后续 02-02 填绿；禁止 live LLM。
 *
 * Mock 目标（填绿时）：
 * - apps/agent-service/src/agents/retriever*
 * - apps/agent-service/src/tools/kb_search*
 * - packages/shared VectorStore
 */
import { describe, expect, it } from "vitest";

describe("Phase 2 regression #2: KB summary triggers Retriever + KB citation", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it.todo("invokes Retriever / kb_search for knowledge-base summary prompt");
  it.todo("emits citation sourced from KB (not web) under mocked store");
});
