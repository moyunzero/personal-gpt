import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();
const deleteByDocumentMock = vi.fn();

vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createVectorStore: () => ({
    search: searchMock,
    deleteByDocument: deleteByDocumentMock,
  }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ASTRA_DB_COLLECTION: "test-collection",
    OPENROUTER_API_KEY: "test-key",
    VECTOR_SEARCH_TIMEOUT_MS: 5000,
    EMBEDDING_CACHE_SIZE: 100,
  },
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    };
  },
}));

vi.mock("@/lib/chat/tracing", () => ({
  traceRetrieveStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) =>
    fn(),
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

describe("Phase 1 regression #4: delete document → no citation on same question", () => {
  const documentId = "33333333-3333-4333-8333-333333333333";
  const query = "请详细介绍一下已删除文档中的项目背景与经历";

  beforeEach(() => {
    vi.clearAllMocks();
    searchMock.mockResolvedValue([]);
    deleteByDocumentMock.mockResolvedValue(undefined);

    const docRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: documentId,
        workspaceId: "11111111-1111-4111-8111-111111111111",
        filePath: "/tmp/uploads/deleted.pdf",
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: () => docRepo,
    } as never);
  });

  it("returns no-docs after document deletion", async () => {
    const deleted = await deleteDocument(documentId);
    expect(deleted).toBe(true);
    expect(deleteByDocumentMock).toHaveBeenCalledWith(
      expect.any(String),
      documentId,
    );

    const result = await getRelevantContext(query, "reg-4");
    expect(result.kind).toBe("no-docs");
    if (result.kind === "ok") {
      expect(result.citations.length).toBe(0);
    }
  });
});
