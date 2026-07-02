import { describe, expect, it, vi } from "vitest";

import {
  assertChunkWorkspaceId,
  assertSearchWorkspaceId,
  type AstraCollectionHandle,
  createAstraVectorStore,
} from "./vector-store.astra";

describe("VectorStore workspace isolation", () => {
  it("search throws when workspaceId is missing", async () => {
    expect(() => assertSearchWorkspaceId(undefined)).toThrow(/workspaceId/i);
    expect(() => assertSearchWorkspaceId("")).toThrow(/workspaceId/i);
  });

  it("upsert rejects chunks without workspaceId metadata", () => {
    expect(() =>
      assertChunkWorkspaceId({
        workspaceId: "",
        documentId: "doc-1",
        chunkIndex: 0,
        text: "hello",
        vector: [0.1],
      }),
    ).toThrow(/workspaceId/i);
  });

  it("search applies workspaceId filter on Astra collection", async () => {
    const find = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    const collection: AstraCollectionHandle = {
      find,
      insertMany: vi.fn(),
      deleteMany: vi.fn(),
    };

    const store = createAstraVectorStore({
      collection,
      collectionName: "test",
    });

    await store.search({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      vector: [0.1, 0.2],
      limit: 3,
    });

    expect(find).toHaveBeenCalledWith(
      { workspaceId: { $eq: "00000000-0000-4000-8000-000000000001" } },
      expect.objectContaining({ limit: 3, includeSimilarity: true }),
    );
  });

  it("upsert includes workspaceId on every chunk payload", async () => {
    const insertMany = vi.fn().mockResolvedValue(undefined);
    const collection: AstraCollectionHandle = {
      find: vi.fn(),
      insertMany,
      deleteMany: vi.fn(),
    };

    const store = createAstraVectorStore({ collection, collectionName: "test" });
    const workspaceId = "00000000-0000-4000-8000-000000000001";

    await store.upsert([
      {
        workspaceId,
        documentId: "doc-1",
        chunkIndex: 0,
        text: "chunk text",
        vector: [0.5, 0.6],
        title: "Title",
        source: "legacy-prompt-suggestion",
        category: "legacy",
      },
    ]);

    expect(insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        workspaceId,
        documentId: "doc-1",
        content: "chunk text",
        $vector: [0.5, 0.6],
      }),
    ]);
  });
});
