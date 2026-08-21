/**
 * Phase 3 regression #5 — Workspace A/B isolation (STORE)。
 * 后续由 Milvus VectorStore + factory 填绿（plan 03-03）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #5: workspace A/B isolation (STORE)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when milvus VectorStore + workspace factory land (plan 03-03)
  it.todo("returns zero cross-workspace hits between workspace A and B");
});
