/**
 * Phase 3 regression #2 — Corpus isolation (CORPUS-01 / D-30 / ISSUE-001)。
 * corpus=user 时禁止引用 psychology-qa；由 migrate-corpus-split + retrieval filter 填绿（plan 03-01/03-02）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #2: corpus isolation forbids psychology-qa (CORPUS-01/D-30)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when corpus split + retrieval filter land (plans 03-01 / 03-02)
  it.todo(
    "forbids psychology-qa citation when corpus=user (ISSUE-001 / migrate-corpus-split)",
  );
});
