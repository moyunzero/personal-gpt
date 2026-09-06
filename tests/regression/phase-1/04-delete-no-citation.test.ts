import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HybridSearchDeps, VectorStore } from "@personal-gpt/shared";

const searchMock = vi.fn();
const deleteByDocumentMock = vi.fn();
const deleteByDocumentIdMock = vi.fn();
const TEST_CTX = {
  userId: "user-test",
  workspaceId: "11111111-1111-4111-8111-111111111111",
};

// documents.service imports createVectorStore from the barrel, not .astra
vi.mock("@personal-gpt/shared/stores/vector-store", () => ({
  createVectorStore: () => ({
    search: searchMock,
    upsert: vi.fn(),
    deleteByDocument: deleteByDocumentMock,
  }),
  shouldWriteAstra: () => true,
  shouldWriteMilvus: () => false,
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    deleteByDocumentId: (...args: unknown[]) => deleteByDocumentIdMock(...args),
    deleteGraphForDocument: vi.fn().mockResolvedValue(undefined),
    deleteCatalogForDocument: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/auth/workspace.service", () => ({
  resolveDocumentAccessContext: vi.fn(async () => ({
    userId: "user-test",
    memberRole: "owner" as const,
  })),
}));

vi.mock("@/lib/db/entity-catalog-store", () => ({
  createEntityCatalogStore: () => ({}),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ASTRA_DB_COLLECTION: "test-collection",
    VECTOR_SEARCH_TIMEOUT_MS: 5000,
    EMBEDDING_CACHE_SIZE: 100,
  },
}));

vi.mock("@/lib/chat/tracing", () => ({
  traceRetrieveStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("node:fs/promises", () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/get-data-source", () => ({
  getDataSource: vi.fn(),
}));

import { getRelevantContext } from "@/lib/chat/retrieve";
import { deleteDocument } from "@/lib/kb/documents.service";
import { getDataSource } from "@/lib/db/get-data-source";

function hybridDeps(): HybridSearchDeps {
  const store: VectorStore = {
    search: searchMock,
    upsert: vi.fn(),
    deleteByDocument: deleteByDocumentMock,
  };
  return {
    embed: async () => [0.1, 0.2, 0.3],
    getStore: () => store,
    esSearch: async () => [],
    rewriteQuery: async (q) => q,
  };
}

describe("Phase 1 regression #4: delete document → no citation on same question", () => {
  const documentId = "33333333-3333-4333-8333-333333333333";
  const query = "请详细介绍一下已删除文档中的项目背景与经历";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_RERANKER = "false";
    searchMock.mockResolvedValue([]);
    deleteByDocumentMock.mockResolvedValue(undefined);
    deleteByDocumentIdMock.mockResolvedValue(undefined);

    const docRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: documentId,
        workspaceId: TEST_CTX.workspaceId,
        filePath: "/tmp/uploads/deleted.pdf",
        visibility: "workspace",
        ownerId: TEST_CTX.userId,
        restrictedUserIds: [],
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: () => docRepo,
    } as never);
  });

  it("returns no-docs after document deletion", async () => {
    const deleted = await deleteDocument(documentId, TEST_CTX);
    expect(deleted).toBe(true);
    expect(deleteByDocumentMock).toHaveBeenCalledWith(expect.any(String), documentId);
    expect(deleteByDocumentIdMock).toHaveBeenCalled();

    const result = await getRelevantContext(query, "reg-4", undefined, {
      hybridDeps: hybridDeps(),
    });
    expect(result.kind).toBe("no-docs");
    if (result.kind === "ok") {
      expect(result.citations.length).toBe(0);
    }
  });
});
