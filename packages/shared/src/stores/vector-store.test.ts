import { describe, expect, it, vi } from "vitest";

import {
  assertChunkWorkspaceId,
  assertSearchWorkspaceId,
  type AstraCollectionHandle,
  createAstraVectorStore,
  resolveAstraCollectionName,
} from "./vector-store.astra";

describe("VectorStore corpus collection targeting (D-24)", () => {
  it("resolveAstraCollectionName targets distinct user vs seed collections", () => {
    const prev = {
      USER: process.env.ASTRA_DB_COLLECTION_USER,
      SEED: process.env.ASTRA_DB_COLLECTION_SEED,
      LEGACY: process.env.ASTRA_DB_COLLECTION,
    };
    process.env.ASTRA_DB_COLLECTION_USER = "kb_user_phys";
    process.env.ASTRA_DB_COLLECTION_SEED = "kb_seed_phys";
    delete process.env.ASTRA_DB_COLLECTION;

    expect(resolveAstraCollectionName({ corpus: "user" })).toBe("kb_user_phys");
    expect(resolveAstraCollectionName({ corpus: "seed" })).toBe("kb_seed_phys");
    expect(resolveAstraCollectionName({})).toBe("kb_user_phys");
    expect(resolveAstraCollectionName({ collectionName: "explicit" })).toBe("explicit");

    if (prev.USER === undefined) delete process.env.ASTRA_DB_COLLECTION_USER;
    else process.env.ASTRA_DB_COLLECTION_USER = prev.USER;
    if (prev.SEED === undefined) delete process.env.ASTRA_DB_COLLECTION_SEED;
    else process.env.ASTRA_DB_COLLECTION_SEED = prev.SEED;
    if (prev.LEGACY === undefined) delete process.env.ASTRA_DB_COLLECTION;
    else process.env.ASTRA_DB_COLLECTION = prev.LEGACY;
  });

  it("falls back to legacy ASTRA_DB_COLLECTION when USER unset (D-26 transition)", () => {
    const prev = {
      USER: process.env.ASTRA_DB_COLLECTION_USER,
      LEGACY: process.env.ASTRA_DB_COLLECTION,
    };
    delete process.env.ASTRA_DB_COLLECTION_USER;
    process.env.ASTRA_DB_COLLECTION = "db_emotion";

    expect(resolveAstraCollectionName({ corpus: "user" })).toBe("db_emotion");

    if (prev.USER === undefined) delete process.env.ASTRA_DB_COLLECTION_USER;
    else process.env.ASTRA_DB_COLLECTION_USER = prev.USER;
    if (prev.LEGACY === undefined) delete process.env.ASTRA_DB_COLLECTION;
    else process.env.ASTRA_DB_COLLECTION = prev.LEGACY;
  });
});

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
      toArray: vi.fn().mockResolvedValue([{ content: "hit", $similarity: 0.9 }]),
    });
    const collection: AstraCollectionHandle = {
      find,
      insertOne: vi.fn(),
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

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(
      { workspaceId: { $eq: "00000000-0000-4000-8000-000000000001" } },
      expect.objectContaining({ limit: 3, includeSimilarity: true }),
    );
  });

  it("search falls back to unscoped query when legacy fallback enabled", async () => {
    const prev = process.env.ASTRA_LEGACY_FALLBACK;
    process.env.ASTRA_LEGACY_FALLBACK = "true";

    const toArray = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ content: "legacy", $similarity: 0.8 }]);
    const find = vi.fn().mockReturnValue({ toArray });
    const collection: AstraCollectionHandle = {
      find,
      insertOne: vi.fn(),
      insertMany: vi.fn(),
      deleteMany: vi.fn(),
    };

    const store = createAstraVectorStore({ collection, collectionName: "test" });
    const hits = await store.search({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      vector: [0.1, 0.2],
      limit: 3,
    });

    expect(find).toHaveBeenCalledTimes(2);
    expect(hits).toHaveLength(1);

    if (prev === undefined) delete process.env.ASTRA_LEGACY_FALLBACK;
    else process.env.ASTRA_LEGACY_FALLBACK = prev;
  });

  it("search does not fall back when legacy fallback disabled", async () => {
    const prev = process.env.ASTRA_LEGACY_FALLBACK;
    delete process.env.ASTRA_LEGACY_FALLBACK;

    const toArray = vi.fn().mockResolvedValueOnce([]);
    const find = vi.fn().mockReturnValue({ toArray });
    const collection: AstraCollectionHandle = {
      find,
      insertOne: vi.fn(),
      insertMany: vi.fn(),
      deleteMany: vi.fn(),
    };

    const store = createAstraVectorStore({ collection, collectionName: "test" });
    const hits = await store.search({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      vector: [0.1, 0.2],
      limit: 3,
    });

    expect(find).toHaveBeenCalledTimes(1);
    expect(hits).toHaveLength(0);

    if (prev !== undefined) process.env.ASTRA_LEGACY_FALLBACK = prev;
  });

  it("upsert includes workspaceId on every chunk payload", async () => {
    const insertOne = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    const collection: AstraCollectionHandle = {
      find: vi.fn(),
      insertOne,
      insertMany: vi.fn(),
      deleteMany,
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

    expect(deleteMany).toHaveBeenCalledWith({
      workspaceId: { $eq: workspaceId },
      documentId: "doc-1",
    });
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        documentId: "doc-1",
        content: "chunk text",
        $vector: [0.5, 0.6],
      }),
    );
    expect(insertOne).toHaveBeenCalledTimes(1);
  });
});
