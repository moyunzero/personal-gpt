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
});
