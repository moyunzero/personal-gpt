/**
 * Phase 3 regression #4 — Checkpointer resume same thread_id (CP-01)。
 * 后续由 PostgresSaver 填绿（plan 03-02）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #4: checkpointer resume same thread_id (CP-01)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when PostgresSaver replaces MemorySaver default (plan 03-02)
  it.todo("resumes graph state for the same thread_id via PostgresSaver");
});
