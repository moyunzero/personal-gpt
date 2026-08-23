import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteByDocumentId = vi.fn();
const indexChunks = vi.fn();
const ensureEsIndexes = vi.fn();
const astraUpsert = vi.fn();
const astraDeleteByDocument = vi.fn();

vi.mock("@personal-gpt/shared/stores/vector-store", () => ({
  shouldWriteAstra: () => true,
  shouldWriteMilvus: () => false,
}));

vi.mock("@personal-gpt/shared/stores/vector-store.milvus", () => ({
  createMilvusVectorStore: () => ({
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
  }),
}));

vi.mock("@personal-gpt/shared", () => ({
  resolveCorpusTargets: (corpus: string) => ({
    astraCollection: corpus === "seed" ? "kb_seed" : "kb_user",
    esIndex: corpus === "seed" ? "es_seed" : "es_user",
  }),
  deleteByDocumentId: (...args: unknown[]) => deleteByDocumentId(...args),
  indexChunks: (...args: unknown[]) => indexChunks(...args),
  ensureEsIndexes: (...args: unknown[]) => ensureEsIndexes(...args),
}));

vi.mock("@personal-gpt/shared/stores/vector-store.astra", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@personal-gpt/shared/stores/vector-store.astra")>();
  return {
    ...actual,
    createAstraVectorStore: () => ({
      upsert: (...args: unknown[]) => astraUpsert(...args),
      deleteByDocument: (...args: unknown[]) => astraDeleteByDocument(...args),
    }),
  };
});

import { deleteDocumentFromEs, upsertChunksToEs } from "./es-upsert";
import { upsertChunks } from "./upsert";
import { deleteDocument } from "./delete";

const sampleChunk = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  documentId: "doc-1",
  chunkIndex: 0,
  text: "hello chunk",
  vector: [0.1, 0.2],
  title: "Title",
  source: "upload",
  category: "kb",
  tags: ["t1"],
};

describe("es dual-write fail-closed (D-10)", () => {
  beforeEach(() => {
    deleteByDocumentId.mockReset();
    indexChunks.mockReset();
    ensureEsIndexes.mockReset();
    astraUpsert.mockReset();
    astraDeleteByDocument.mockReset();
    deleteByDocumentId.mockResolvedValue(undefined);
    indexChunks.mockResolvedValue(undefined);
    ensureEsIndexes.mockResolvedValue(undefined);
    astraUpsert.mockResolvedValue(undefined);
    astraDeleteByDocument.mockResolvedValue(undefined);
  });

  it("upsertChunksToEs deletes then indexes into user ES index", async () => {
    await upsertChunksToEs([sampleChunk], "user");

    expect(ensureEsIndexes).toHaveBeenCalledWith(["es_user"]);
    expect(deleteByDocumentId).toHaveBeenCalledWith("es_user", sampleChunk.workspaceId, "doc-1");
    expect(indexChunks).toHaveBeenCalledWith(
      "es_user",
      expect.arrayContaining([
        expect.objectContaining({
          documentId: "doc-1",
          content: "hello chunk",
          workspaceId: sampleChunk.workspaceId,
        }),
      ]),
    );
  });

  it("upsertChunksToEs rejects mixed workspaceId batches", async () => {
    await expect(
      upsertChunksToEs(
        [sampleChunk, { ...sampleChunk, workspaceId: "00000000-0000-4000-8000-000000000002" }],
        "user",
      ),
    ).rejects.toThrow(/workspaceId/i);
    expect(indexChunks).not.toHaveBeenCalled();
  });

  it("upsertChunks rejects when ES indexChunks throws (fail-closed)", async () => {
    indexChunks.mockRejectedValue(new Error("ES bulk failed"));

    await expect(upsertChunks([sampleChunk])).rejects.toThrow(/ES bulk failed/);
    expect(astraUpsert).toHaveBeenCalledOnce();
  });

  it("deleteDocumentFromEs removes docs for documentId", async () => {
    await deleteDocumentFromEs(sampleChunk.workspaceId, "doc-1", "user");
    expect(deleteByDocumentId).toHaveBeenCalledWith("es_user", sampleChunk.workspaceId, "doc-1");
  });

  it("deleteDocument clears Astra then ES", async () => {
    await deleteDocument(sampleChunk.workspaceId, "doc-1", "user");
    expect(astraDeleteByDocument).toHaveBeenCalledWith(sampleChunk.workspaceId, "doc-1");
    expect(deleteByDocumentId).toHaveBeenCalledWith("es_user", sampleChunk.workspaceId, "doc-1");
  });
});
