import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";

const TEST_CTX = { userId: "user-test", workspaceId: DEFAULT_WORKSPACE_ID };

vi.mock("@/lib/auth/workspace.service", () => ({
  resolveDocumentAccessContext: vi.fn(async () => ({
    userId: "user-test",
    memberRole: "owner" as const,
  })),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ALLOWED_MIME_TYPES: [
      "application/pdf",
      "text/markdown",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    UPLOAD_MAX_BYTES: 20_971_520,
  },
}));

const insertMock = vi.fn();
const jobInsertMock = vi.fn();
const queueAddMock = vi.fn();
const jobUpdateMock = vi.fn();
const docUpdateMock = vi.fn();
const docFindOneMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  unlink: vi.fn(),
}));

vi.mock("@/lib/db/get-data-source", () => ({
  getDataSource: vi.fn(),
}));

vi.mock("@/lib/kb/queue", () => ({
  getIngestQueue: vi.fn(() => ({
    add: queueAddMock,
  })),
}));

vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createVectorStore: vi.fn(),
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    deleteGraphForDocument: vi.fn().mockResolvedValue(undefined),
    deleteCatalogForDocument: vi.fn().mockResolvedValue(undefined),
    deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    resolveCorpusTargets: () => ({ astraCollection: "kb_user", esIndex: "es_user" }),
  };
});

vi.mock("@personal-gpt/shared/stores/vector-store", () => ({
  createVectorStore: () => ({
    search: vi.fn(),
    upsert: vi.fn(),
    deleteByDocument: vi.fn().mockResolvedValue(undefined),
  }),
  shouldWriteAstra: () => false,
  shouldWriteMilvus: () => false,
}));

vi.mock("@/lib/db/entity-catalog-store", () => ({
  createEntityCatalogStore: () => ({}),
}));

import { DocumentEntity } from "@/lib/db/entities/document.entity";
import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import { getDataSource } from "@/lib/db/get-data-source";
import {
  listDocuments,
  reindexDocument,
  serializeDocumentRow,
  updateDocumentMetadata,
  uploadDocument,
  uploadDocumentFromRemote,
  UploadValidationError,
  validateUploadFile,
} from "./documents.service";

const ALLOWED = [
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function makeFile(
  overrides: Partial<{
    name: string;
    type: string;
    size: number;
  }> = {},
) {
  return {
    name: overrides.name ?? "sample.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? 1024,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

describe("validateUploadFile", () => {
  it("rejects disallowed MIME types", () => {
    expect(() =>
      validateUploadFile(
        { type: "application/x-msdownload", size: 100 },
        { allowedMimeTypes: ALLOWED, maxBytes: 20_971_520 },
      ),
    ).toThrow(UploadValidationError);

    try {
      validateUploadFile(
        { type: "image/png", size: 100 },
        { allowedMimeTypes: ALLOWED, maxBytes: 20_971_520 },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UploadValidationError);
      expect((error as UploadValidationError).code).toBe("mime_not_allowed");
    }
  });

  it("rejects files larger than 20MB", () => {
    expect(() =>
      validateUploadFile(
        { type: "application/pdf", size: 21 * 1024 * 1024 },
        { allowedMimeTypes: ALLOWED, maxBytes: 20_971_520 },
      ),
    ).toThrow(UploadValidationError);

    try {
      validateUploadFile(
        { type: "application/pdf", size: 25_000_000 },
        { allowedMimeTypes: ALLOWED, maxBytes: 20_971_520 },
      );
    } catch (error) {
      expect((error as UploadValidationError).code).toBe("file_too_large");
    }
  });
});

describe("uploadDocument enqueue contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    insertMock.mockImplementation(async (row: Record<string, unknown>) => row);
    jobInsertMock.mockResolvedValue(undefined);
    queueAddMock.mockResolvedValue({ id: "bull-123" });
    jobUpdateMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    docFindOneMock.mockImplementation(async ({ id }: { id: string }) => {
      const inserted = insertMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      return {
        id,
        workspaceId: TEST_CTX.workspaceId,
        ownerId: TEST_CTX.userId,
        title: "sample",
        source: "sample.pdf",
        category: null,
        tags: [],
        status: "pending",
        chunkCount: 0,
        filePath: "/tmp/uploads/x.pdf",
        mimeType: "application/pdf",
        visibility: "workspace",
        restrictedUserIds: [],
        ...inserted,
        id,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    });

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return { insert: insertMock, findOneByOrFail: docFindOneMock };
        }
        if (entity === IngestJobEntity) {
          return {
            insert: jobInsertMock,
            update: jobUpdateMock,
          };
        }
        throw new Error("unexpected entity");
      },
    } as never);
  });

  it("returns pending document and ingest job id after enqueue", async () => {
    const { document, job } = await uploadDocument(makeFile(), TEST_CTX);

    expect(document.status).toBe("pending");
    expect(document.createdAt).toBeInstanceOf(Date);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        mimeType: "application/pdf",
      }),
    );
    expect(docFindOneMock).toHaveBeenCalledWith(expect.objectContaining({ id: document.id }));
    expect(jobInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: document.id,
        status: "queued",
      }),
    );
    expect(job?.id).toBeTruthy();
    expect(queueAddMock).toHaveBeenCalledWith(
      expect.stringContaining(`ingest-${document.id}`),
      expect.objectContaining({
        documentId: document.id,
        mimeType: "application/pdf",
      }),
    );
    expect(jobUpdateMock).toHaveBeenCalledWith({ id: job?.id }, { bullJobId: "bull-123" });
  });

  it("serializeDocumentRow after upload has ISO timestamps", async () => {
    const { document, job } = await uploadDocument(makeFile(), TEST_CTX);
    const row = serializeDocumentRow(document, job);
    expect(row.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(row.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("passes category and tags into ingest queue payload", async () => {
    await uploadDocument(makeFile(), TEST_CTX, { category: "docs", tags: ["ai", "rag"] });

    expect(queueAddMock).toHaveBeenCalledWith(
      expect.stringMatching(/^ingest-/),
      expect.objectContaining({
        category: "docs",
        tags: ["ai", "rag"],
      }),
    );
  });

  it("registers remote Vercel Blob URL without writing local file", async () => {
    const { document, job } = await uploadDocumentFromRemote(
      {
        fileUrl: "https://abc123.blob.vercel-storage.com/uploads/x.pdf",
        fileName: "guide.pdf",
        mimeType: "application/pdf",
        size: 5_500_000,
      },
      TEST_CTX,
      { title: "guide" },
    );

    expect(document.status).toBe("pending");
    expect(job?.id).toBeTruthy();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(queueAddMock).toHaveBeenCalledWith(
      expect.stringContaining(`ingest-${document.id}`),
      expect.objectContaining({
        filePath: "https://abc123.blob.vercel-storage.com/uploads/x.pdf",
        mimeType: "application/pdf",
      }),
    );
  });

  it("rejects untrusted remote URL", async () => {
    await expect(
      uploadDocumentFromRemote(
        {
          fileUrl: "https://evil.example.com/x.pdf",
          fileName: "x.pdf",
          mimeType: "application/pdf",
          size: 1000,
        },
        TEST_CTX,
      ),
    ).rejects.toMatchObject({ code: "untrusted_url" });
  });
});

describe("reindexDocument (INGEST-05)", () => {
  const workspaceId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();

    const documentEntity = {
      id: "doc-reindex",
      workspaceId,
      title: "reindex-me",
      status: "ready",
      filePath: "/tmp/uploads/reindex.pdf",
      mimeType: "application/pdf",
      tags: ["tag-a"],
      category: "docs",
      chunkCount: 12,
      visibility: "workspace",
      ownerId: "user-test",
      restrictedUserIds: [],
    };

    docFindOneMock.mockResolvedValue(documentEntity);
    docUpdateMock.mockResolvedValue(undefined);
    jobInsertMock.mockResolvedValue(undefined);
    queueAddMock.mockResolvedValue({ id: "bull-reindex-456" });
    jobUpdateMock.mockResolvedValue(undefined);

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return {
            findOne: docFindOneMock,
            update: docUpdateMock,
          };
        }
        if (entity === IngestJobEntity) {
          return {
            insert: jobInsertMock,
            update: jobUpdateMock,
          };
        }
        throw new Error("unexpected entity");
      },
    } as never);
  });

  it("sets status processing and enqueues BullMQ job", async () => {
    const result = await reindexDocument("doc-reindex", TEST_CTX);

    expect(result).not.toBeNull();
    expect(docUpdateMock).toHaveBeenCalledWith(
      { id: "doc-reindex", workspaceId },
      { status: "processing", chunkCount: 0 },
    );
    expect(result?.document.status).toBe("processing");
    expect(result?.document.chunkCount).toBe(0);
    expect(queueAddMock).toHaveBeenCalledWith(
      "ingest-doc-reindex",
      expect.objectContaining({
        documentId: "doc-reindex",
        filePath: "/tmp/uploads/reindex.pdf",
        mimeType: "application/pdf",
      }),
    );
    expect(result?.job.id).toBeTruthy();
    expect(jobInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-reindex",
        status: "queued",
      }),
    );
    expect(jobUpdateMock).toHaveBeenCalledWith(
      { id: result?.job.id },
      { bullJobId: "bull-reindex-456" },
    );
  });

  it("returns null when document is missing filePath", async () => {
    docFindOneMock.mockResolvedValue({
      id: "doc-no-path",
      workspaceId,
      filePath: null,
      mimeType: "application/pdf",
    });

    const result = await reindexDocument("doc-no-path", TEST_CTX);

    expect(result).toBeNull();
    expect(docUpdateMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
  });
});

describe("updateDocumentMetadata (KB-02)", () => {
  const workspaceId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();

    const documentEntity = {
      id: "doc-meta",
      workspaceId,
      title: "meta-doc",
      status: "ready",
      category: "old-cat",
      tags: ["a"],
      chunkCount: 1,
      visibility: "workspace",
      ownerId: "user-test",
      restrictedUserIds: [],
    };

    docFindOneMock.mockResolvedValue(documentEntity);
    docUpdateMock.mockResolvedValue(undefined);

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return {
            findOne: docFindOneMock,
            update: docUpdateMock,
          };
        }
        throw new Error("unexpected entity");
      },
    } as never);
  });

  it("stores null when category is cleared", async () => {
    const result = await updateDocumentMetadata("doc-meta", TEST_CTX, { category: null });

    expect(result?.category).toBeNull();
    expect(docUpdateMock).toHaveBeenCalledWith({ id: "doc-meta", workspaceId }, { category: null });
  });
});

describe("listDocuments tags filter (KB-03)", () => {
  const andWhereMock = vi.fn().mockReturnThis();
  const orderByMock = vi.fn().mockReturnThis();
  const skipMock = vi.fn().mockReturnThis();
  const takeMock = vi.fn().mockReturnThis();
  const getManyAndCountMock = vi.fn().mockResolvedValue([[], 0]);
  const jobWhereMock = vi.fn().mockReturnThis();
  const jobOrderByMock = vi.fn().mockReturnThis();
  const jobGetManyMock = vi.fn().mockResolvedValue([]);

  beforeEach(() => {
    vi.clearAllMocks();
    andWhereMock.mockReturnThis();
    orderByMock.mockReturnThis();
    skipMock.mockReturnThis();
    takeMock.mockReturnThis();
    getManyAndCountMock.mockResolvedValue([[], 0]);
    jobWhereMock.mockReturnThis();
    jobOrderByMock.mockReturnThis();
    jobGetManyMock.mockResolvedValue([]);

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return {
            createQueryBuilder: () => ({
              where: vi.fn().mockReturnThis(),
              andWhere: andWhereMock,
              orderBy: orderByMock,
              skip: skipMock,
              take: takeMock,
              getManyAndCount: getManyAndCountMock,
            }),
          };
        }
        if (entity === IngestJobEntity) {
          return {
            createQueryBuilder: () => ({
              where: jobWhereMock,
              orderBy: jobOrderByMock,
              getMany: jobGetManyMock,
            }),
          };
        }
        throw new Error("unexpected entity");
      },
    } as never);
  });

  it("applies tags OR filter via query builder", async () => {
    await listDocuments(TEST_CTX, { tags: ["python"] });

    expect(andWhereMock).toHaveBeenCalledWith("doc.tags ?| array[:...tags]", { tags: ["python"] });
  });
});
