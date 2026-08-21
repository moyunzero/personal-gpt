/**
 * Phase 3 regression #1 — Hybrid + 专有名词召回 (RAG-06)。
 * 后续由 hybridSearch / RRF 填绿（plan 03-01）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #1: hybrid proper-noun retrieval (RAG-06)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when hybridSearch + reciprocalRankFusion land (plan 03-01)
  it.todo("returns proper-noun hits via hybridSearch + RRF for corpus=user queries");
});
