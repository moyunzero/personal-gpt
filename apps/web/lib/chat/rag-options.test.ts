import { describe, expect, it } from "vitest";

import { ENABLE_HYDE, ENABLE_MULTI_QUERY, ENABLE_RERANKER } from "./rag-options";

describe("rag-options defaults", () => {
  it("keeps HyDE and Multi-Query disabled by default (D-15)", () => {
    expect(ENABLE_HYDE).toBe(false);
    expect(ENABLE_MULTI_QUERY).toBe(false);
  });

  it("enables reranker by default when ENABLE_RERANKER is unset (D-11)", () => {
    // Escape hatch: ENABLE_RERANKER=false. This suite assumes unset or "true".
    if (process.env.ENABLE_RERANKER === "false") {
      expect(ENABLE_RERANKER).toBe(false);
      return;
    }
    expect(ENABLE_RERANKER).toBe(true);
  });
});
