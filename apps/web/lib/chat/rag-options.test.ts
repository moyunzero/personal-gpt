import { describe, expect, it } from "vitest";

import { ENABLE_HYDE, ENABLE_MULTI_QUERY, ENABLE_RERANKER } from "./rag-options";

describe("rag-options defaults", () => {
  it("keeps optional RAG enhancements disabled by default", () => {
    expect(ENABLE_HYDE).toBe(false);
    expect(ENABLE_MULTI_QUERY).toBe(false);
    expect(ENABLE_RERANKER).toBe(false);
  });
});
