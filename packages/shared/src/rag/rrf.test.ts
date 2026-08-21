/**
 * Stub for reciprocalRankFusion (plan 03-01 / Wave 1).
 * Soft-skips until packages/shared/src/rag/rrf.ts exists.
 */
import { describe, expect, it } from "vitest";

describe("reciprocalRankFusion", () => {
  it("soft-skips until rrf module lands", async () => {
    try {
      await import("./rrf.js");
    } catch {
      expect(true).toBe(true);
      return;
    }
    // Module present — Wave 1 should replace this with real assertions
    expect(true).toBe(true);
  });

  it.todo("merges ranked lists via reciprocalRankFusion with stable corpus=user preference");
});
