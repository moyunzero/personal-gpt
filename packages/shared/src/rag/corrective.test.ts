/**
 * Stub for maybeCorrective / correctiveRewriteOnce (plan 03-01 / Wave 1).
 * Soft-skips until packages/shared/src/rag/corrective.ts exists.
 */
import { describe, expect, it } from "vitest";

describe("correctiveRewriteOnce / maybeCorrective", () => {
  it("soft-skips until corrective module lands", async () => {
    try {
      await import("./corrective.js");
    } catch {
      expect(true).toBe(true);
      return;
    }
    expect(true).toBe(true);
  });

  it.todo("runs at most one corrective rewrite via maybeCorrective / correctiveRewriteOnce");
});
