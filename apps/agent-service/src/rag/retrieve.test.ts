/**
 * resolveKbMinSimilarity / retrieveKb via shared hybridSearch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_KB_MIN_SIMILARITY, resolveKbMinSimilarity, retrieveKb } from "./retrieve";

describe("resolveKbMinSimilarity", () => {
  const prev = process.env.AGENT_KB_MIN_SIMILARITY;

  afterEach(() => {
    if (prev === undefined) delete process.env.AGENT_KB_MIN_SIMILARITY;
    else process.env.AGENT_KB_MIN_SIMILARITY = prev;
  });

  it("accepts override in [0,1]", () => {
    expect(resolveKbMinSimilarity(0)).toBe(0);
    expect(resolveKbMinSimilarity(0.5)).toBe(0.5);
    expect(resolveKbMinSimilarity(1)).toBe(1);
  });

  it("falls back when override > 1 or non-finite", () => {
    expect(resolveKbMinSimilarity(1.5)).toBe(DEFAULT_KB_MIN_SIMILARITY);
    expect(resolveKbMinSimilarity(Number.NaN)).toBe(DEFAULT_KB_MIN_SIMILARITY);
  });

  it("clamps env AGENT_KB_MIN_SIMILARITY to [0,1]", () => {
    process.env.AGENT_KB_MIN_SIMILARITY = "2";
    expect(resolveKbMinSimilarity()).toBe(DEFAULT_KB_MIN_SIMILARITY);
    process.env.AGENT_KB_MIN_SIMILARITY = "0.7";
    expect(resolveKbMinSimilarity()).toBe(0.7);
  });
});

describe("retrieveKb via hybridSearch", () => {
  it("uses max similarity across raw hits, not raw[0]", async () => {
    const search = vi.fn().mockResolvedValue([
      { text: "a", similarity: 0.2, title: "low" },
      { text: "b", similarity: 0.9, title: "high" },
      { text: "c", similarity: 0.5, title: "mid" },
    ]);
    const out = await retrieveKb({
      query: "q",
      minSimilarity: 0.95,
      hybridDeps: {
        embed: vi.fn().mockResolvedValue([0.1]),
        getStore: () => ({
          search,
          upsert: vi.fn(),
          deleteByDocument: vi.fn(),
        }),
        esSearch: async () => [],
        rewriteQuery: async (q) => q,
        rerank: async (_q, hits) => hits,
      },
    });
    // topSimilarity is derived from raw hit similarity before minSimilarity filter
    expect(out.topSimilarity).toBe(0.9);
    expect(out.chunks).toEqual([]);
  });

  it("leaves topSimilarity undefined when raw is empty", async () => {
    const out = await retrieveKb({
      query: "q",
      hybridDeps: {
        embed: vi.fn().mockResolvedValue([0.1]),
        getStore: () => ({
          search: vi.fn().mockResolvedValue([]),
          upsert: vi.fn(),
          deleteByDocument: vi.fn(),
        }),
        esSearch: async () => [],
        rewriteQuery: async (q) => q,
      },
    });
    expect(out.topSimilarity).toBeUndefined();
  });

  it("calls hybridSearch with corpus=user by default", async () => {
    const search = vi.fn().mockResolvedValue([
      {
        text: "hit",
        similarity: 0.95,
        title: "t",
        documentId: "d1",
        chunkIndex: 0,
      },
    ]);
    const out = await retrieveKb({
      query: "政策",
      minSimilarity: 0,
      hybridDeps: {
        embed: vi.fn().mockResolvedValue([0.1]),
        getStore: () => ({
          search,
          upsert: vi.fn(),
          deleteByDocument: vi.fn(),
        }),
        esSearch: async () => [],
        rewriteQuery: async (q) => q,
        rerank: async (_q, hits) => hits,
      },
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: expect.any(String) }),
    );
    expect(out.chunks.length).toBeGreaterThan(0);
  });
});
