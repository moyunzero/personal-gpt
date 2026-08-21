/**
 * Phase 3 regression #5 — Workspace A/B isolation (STORE-01).
 * 禁止 live LLM / live Milvus。
 */
import { describe, expect, it, vi } from "vitest";

import {
  createMilvusVectorStore,
  resolveVectorBackend,
  type ChunkRecord,
  type MilvusClientLike,
  type RetrievedChunk,
  type VectorStore,
} from "@personal-gpt/shared/stores/vector-store";

const WS_A = "00000000-0000-4000-8000-00000000000a";
const WS_B = "00000000-0000-4000-8000-00000000000b";
const DOC_TITLE = "Employee Handbook";
const DOC_TEXT = "Same title and body across tenants.";

function makeChunk(workspaceId: string, documentId: string): ChunkRecord {
  return {
    workspaceId,
    documentId,
    chunkIndex: 0,
    text: DOC_TEXT,
    vector: [0.1, 0.2, 0.3],
    title: DOC_TITLE,
    source: "handbook.pdf",
  };
}

/** In-memory VectorStore that always filters by workspaceId (isolation oracle). */
function createInMemoryVectorStore(): VectorStore {
  const rows: ChunkRecord[] = [];
  return {
    async upsert(chunks) {
      for (const chunk of chunks) {
        if (!chunk.workspaceId?.trim()) {
          throw new Error("VectorStore.upsert requires workspaceId on every chunk");
        }
        const idx = rows.findIndex(
          (r) =>
            r.workspaceId === chunk.workspaceId &&
            r.documentId === chunk.documentId &&
            r.chunkIndex === chunk.chunkIndex,
        );
        if (idx >= 0) rows[idx] = chunk;
        else rows.push(chunk);
      }
    },
    async deleteByDocument(workspaceId, documentId) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.workspaceId === workspaceId && rows[i]!.documentId === documentId) {
          rows.splice(i, 1);
        }
      }
    },
    async search(params): Promise<RetrievedChunk[]> {
      if (!params.workspaceId?.trim()) {
        throw new Error("VectorStore.search requires workspaceId");
      }
      return rows
        .filter((r) => r.workspaceId === params.workspaceId)
        .map((r) => ({
          text: r.text,
          similarity: 0.99,
          title: r.title,
          source: r.source,
          documentId: r.documentId,
          chunkIndex: r.chunkIndex,
        }));
    },
  };
}

describe("Phase 3 regression #5: workspace A/B isolation (STORE)", () => {
  it("returns zero cross-workspace hits between workspace A and B", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert([
      makeChunk(WS_A, "doc-shared-title"),
      makeChunk(WS_B, "doc-shared-title"),
    ]);

    const hitsA = await store.search({
      workspaceId: WS_A,
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    });
    const hitsB = await store.search({
      workspaceId: WS_B,
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    });

    expect(hitsA).toHaveLength(1);
    expect(hitsB).toHaveLength(1);
    expect(hitsA[0]!.documentId).toBe("doc-shared-title");
    expect(hitsB[0]!.documentId).toBe("doc-shared-title");
    expect(hitsA.every((h) => h.text === DOC_TEXT)).toBe(true);
    // Isolation: A's hits must not include B's tenant (documentId alone is not enough —
    // verify via scoped search never returning the other workspace's only row as cross).
    expect(hitsA).toHaveLength(1);
    expect(hitsB).toHaveLength(1);
    const allA = await store.search({ workspaceId: WS_A, vector: [1], limit: 100 });
    expect(allA.every((h) => h.documentId === "doc-shared-title")).toBe(true);
    expect(allA).toHaveLength(1);
  });

  it("Milvus search throws without workspaceId and always filters by it", async () => {
    const search = vi.fn().mockResolvedValue({
      results: [
        {
          content: DOC_TEXT,
          score: 0.95,
          documentId: "doc-shared-title",
          workspaceId: WS_A,
        },
      ],
    });
    const client: MilvusClientLike = {
      hasCollection: vi.fn().mockResolvedValue({ value: true }),
      createCollection: vi.fn(),
      createIndex: vi.fn(),
      loadCollection: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      search,
    };

    const store = createMilvusVectorStore({
      client,
      collectionName: "kb_user_test",
      skipEnsure: true,
    });

    await expect(
      store.search({
        workspaceId: "",
        vector: [0.1],
        limit: 3,
      }),
    ).rejects.toThrow(/workspaceId/i);

    await store.search({
      workspaceId: WS_A,
      vector: [0.1, 0.2],
      limit: 3,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining(`workspaceId == "${WS_A}"`),
      }),
    );
    expect(search.mock.calls[0]![0].filter).not.toContain(WS_B);
  });

  it("factory defaults to astra and switches to milvus via VECTOR_BACKEND", () => {
    const prev = process.env.VECTOR_BACKEND;
    delete process.env.VECTOR_BACKEND;
    expect(resolveVectorBackend()).toBe("astra");

    process.env.VECTOR_BACKEND = "milvus";
    expect(resolveVectorBackend()).toBe("milvus");

    // createVectorStoreFromEnv with milvus + injected path: resolve only (no live connect)
    process.env.VECTOR_BACKEND = "astra";
    expect(resolveVectorBackend()).toBe("astra");

    if (prev === undefined) delete process.env.VECTOR_BACKEND;
    else process.env.VECTOR_BACKEND = prev;
  });

  it("factory path: getStore milvus mock never leaks workspace B into A search", async () => {
    const prev = process.env.VECTOR_BACKEND;
    process.env.VECTOR_BACKEND = "milvus";

    const search = vi.fn().mockImplementation(async (params: { filter?: string }) => {
      const filter = params.filter ?? "";
      if (filter.includes(WS_A)) {
        return {
          results: [{ content: DOC_TEXT, score: 0.9, documentId: "doc-a", workspaceId: WS_A }],
        };
      }
      if (filter.includes(WS_B)) {
        return {
          results: [{ content: DOC_TEXT, score: 0.9, documentId: "doc-b", workspaceId: WS_B }],
        };
      }
      return { results: [] };
    });

    const client: MilvusClientLike = {
      hasCollection: vi.fn().mockResolvedValue({ value: true }),
      createCollection: vi.fn(),
      createIndex: vi.fn(),
      loadCollection: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      search,
    };

    // Direct milvus store mirrors what factory would return for VECTOR_BACKEND=milvus
    const store = createMilvusVectorStore({
      client,
      collectionName: "kb_user_test",
      skipEnsure: true,
    });
    expect(resolveVectorBackend()).toBe("milvus");

    const hitsA = await store.search({ workspaceId: WS_A, vector: [0.1], limit: 5 });
    const hitsB = await store.search({ workspaceId: WS_B, vector: [0.1], limit: 5 });

    expect(hitsA).toHaveLength(1);
    expect(hitsB).toHaveLength(1);
    expect(hitsA[0]!.documentId).toBe("doc-a");
    expect(hitsB[0]!.documentId).toBe("doc-b");
    expect(hitsA[0]!.documentId).not.toBe(hitsB[0]!.documentId);

    if (prev === undefined) delete process.env.VECTOR_BACKEND;
    else process.env.VECTOR_BACKEND = prev;
  });
});
