import { describe, expect, it, vi } from "vitest";

import {
  createMilvusVectorStore,
  mapMilvusHit,
  type MilvusClientLike,
} from "./vector-store.milvus";

describe("mapMilvusHit", () => {
  it("maps finite page from hit.page", () => {
    expect(mapMilvusHit({ content: "x", score: 1, page: 4 }).page).toBe(4);
  });

  it("omits page when missing or non-finite", () => {
    expect(mapMilvusHit({ content: "x", score: 1 })).not.toHaveProperty("page");
    expect(mapMilvusHit({ content: "x", score: 1, page: Number.NaN })).not.toHaveProperty("page");
  });

  it("keeps raw COSINE score without (score+1)/2 remapping", () => {
    expect(mapMilvusHit({ content: "x", score: 0.3 }).similarity).toBe(0.3);
    expect(mapMilvusHit({ content: "x", score: -0.2 }).similarity).toBe(-0.2);
    expect(mapMilvusHit({ content: "x", score: 1 }).similarity).toBe(1);
  });
});

describe("milvus page filter over-fetch", () => {
  it("requests more candidates when page filter is set, then slices to limit", async () => {
    const search = vi.fn(async () => ({
      results: Array.from({ length: 12 }, (_, i) => ({
        content: `c${i}`,
        score: 1 - i * 0.01,
        page: i % 2 === 0 ? 2 : 1,
        documentId: `d${i}`,
        chunkIndex: i,
        workspaceId: "ws-1",
      })),
    }));
    const client: MilvusClientLike = {
      hasCollection: async () => true,
      createCollection: async () => ({}),
      createIndex: async () => ({}),
      loadCollection: async () => ({}),
      insert: async () => ({}),
      delete: async () => ({}),
      search,
    };
    const store = createMilvusVectorStore({ client, skipEnsure: true, collectionName: "t" });
    const hits = await store.search({
      vector: [0.1],
      workspaceId: "ws-1",
      limit: 3,
      filter: { page: { $eq: 2 } },
    });
    expect(search.mock.calls[0]![0].limit).toBe(Math.max(3 * 5, 50));
    expect(hits.every((h) => h.page === 2)).toBe(true);
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it("recovers page hits that fall outside the original limit window", async () => {
    // Ranks 0–9: page 1; ranks 10–14: page 2. Without over-fetch (limit=5),
    // local page filter would see only page-1 rows and return [].
    const ranked = [
      ...Array.from({ length: 10 }, (_, i) => ({
        content: `p1-${i}`,
        score: 1 - i * 0.001,
        page: 1,
        documentId: `d1-${i}`,
        chunkIndex: i,
        workspaceId: "ws-1",
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        content: `p2-${i}`,
        score: 0.5 - i * 0.001,
        page: 2,
        documentId: `d2-${i}`,
        chunkIndex: i,
        workspaceId: "ws-1",
      })),
    ];
    const search = vi.fn(async (params: { limit?: number }) => ({
      results: ranked.slice(0, params.limit ?? ranked.length),
    }));
    const client: MilvusClientLike = {
      hasCollection: async () => true,
      createCollection: async () => ({}),
      createIndex: async () => ({}),
      loadCollection: async () => ({}),
      insert: async () => ({}),
      delete: async () => ({}),
      search,
    };
    const store = createMilvusVectorStore({ client, skipEnsure: true, collectionName: "t" });
    const hits = await store.search({
      vector: [0.1],
      workspaceId: "ws-1",
      limit: 5,
      filter: { page: { $eq: 2 } },
    });
    expect(search.mock.calls[0]![0].limit).toBe(50);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.page === 2)).toBe(true);
    expect(hits.length).toBeLessThanOrEqual(5);
  });
});
