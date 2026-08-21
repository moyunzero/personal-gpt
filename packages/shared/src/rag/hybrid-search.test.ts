/**
 * hybridSearch fail-open: ES throw → vector-only, never reject (D-13).
 */
import { describe, expect, it, vi } from "vitest";

import type { RetrievedChunk, VectorStore } from "../stores/vector-store";
import { hybridSearch } from "./hybrid-search";

const vectorHits: RetrievedChunk[] = [
  {
    text: "vector-only hit",
    similarity: 0.88,
    documentId: "doc-v",
    chunkIndex: 0,
    title: "vec",
  },
];

function mockStore(hits: RetrievedChunk[]): VectorStore {
  return {
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
    search: vi.fn(async () => hits),
  };
}

describe("hybridSearch", () => {
  it("fail-opens to vector-only when ES throws (D-13)", async () => {
    process.env.ENABLE_RERANKER = "false";

    const logWarn = vi.fn();
    const result = await hybridSearch(
      {
        query: "专有名词测试",
        workspaceId: "ws-1",
        corpus: "user",
        limit: 5,
      },
      {
        embed: async () => [0.1, 0.2, 0.3],
        getStore: () => mockStore(vectorHits),
        esSearch: async () => {
          throw new Error("ES connection refused");
        },
        logWarn,
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.documentId).toBe("doc-v");
    expect(result[0]!.text).toBe("vector-only hit");
    expect(logWarn).toHaveBeenCalledWith(
      "es unavailable; vector-only",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("defaults corpus to user and requires workspaceId", async () => {
    process.env.ENABLE_RERANKER = "false";
    await expect(
      hybridSearch(
        { query: "x", workspaceId: "" },
        {
          embed: async () => [0.1],
          getStore: () => mockStore([]),
          esSearch: async () => [],
        },
      ),
    ).rejects.toThrow(/workspaceId/);
  });
});
