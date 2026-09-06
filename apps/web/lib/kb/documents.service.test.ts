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

const saveMock = vi.fn();
const createMock = vi.fn();
const queueAddMock = vi.fn();
const jobUpdateMock = vi.fn();
const jobSaveMock = vi.fn();
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
  updateDocumentMetadata,
  uploadDocument,
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

    const documentEntity = {
      id: "doc-uuid",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "sample",
      status: "pending",
      filePath: "/tmp/uploads/x.pdf",
      mimeType: "application/pdf",
      tags: [],
      category: null,
      chunkCount: 0,
    };

    const ingestJobEntity = {
      id: "job-uuid",
      workspaceId: documentEntity.workspaceId,
      documentId: documentEntity.id,
      status: "queued",
      progress: 0,
      bullJobId: null,
    };

    createMock.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      id: data.documentId ? ingestJobEntity.id : documentEntity.id,
    }));
    saveMock.mockImplementation(async (entity: Record<string, unknown>) => {
      if (entity.status === "pending") {
        return { ...documentEntity, ...entity, id: documentEntity.id };
      }
      return { ...ingestJobEntity, ...entity };
    });

    queueAddMock.mockResolvedValue({ id: "bull-123" });
    jobUpdateMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return { create: createMock, save: saveMock };
        }
        if (entity === IngestJobEntity) {
          return {
            create: createMock,
            save: jobSaveMock.mockResolvedValue(ingestJobEntity),
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
    expect(job?.id).toBe("job-uuid");
    expect(queueAddMock).toHaveBeenCalledWith(
      expect.stringContaining("ingest-doc-uuid"),
      expect.objectContaining({
        documentId: "doc-uuid",
        mimeType: "application/pdf",
      }),
    );
    expect(jobUpdateMock).toHaveBeenCalledWith({ id: "job-uuid" }, { bullJobId: "bull-123" });
  });

  it("passes category and tags into ingest queue payload", async () => {
    await uploadDocument(makeFile(), TEST_CTX, { category: "docs", tags: ["ai", "rag"] });

    expect(queueAddMock).toHaveBeenCalledWith(
      "ingest-doc-uuid",
      expect.objectContaining({
        category: "docs",
        tags: ["ai", "rag"],
      }),
    );
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

    const ingestJobEntity = {
      id: "job-reindex",
      workspaceId,
      documentId: documentEntity.id,
      status: "queued",
      progress: 0,
      bullJobId: null,
    };

    docFindOneMock.mockResolvedValue(documentEntity);
    docUpdateMock.mockResolvedValue(undefined);
    createMock.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      id: data.documentId ? ingestJobEntity.id : documentEntity.id,
    }));
    jobSaveMock.mockResolvedValue(ingestJobEntity);
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
            create: createMock,
            save: jobSaveMock,
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
    expect(result?.job.id).toBe("job-reindex");
    expect(jobUpdateMock).toHaveBeenCalledWith(
      { id: "job-reindex" },
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
    saveMock.mockImplementation(async (entity: Record<string, unknown>) => ({
      ...documentEntity,
      ...entity,
    }));

    vi.mocked(getDataSource).mockResolvedValue({
      getRepository: (entity: unknown) => {
        if (entity === DocumentEntity) {
          return {
            findOne: docFindOneMock,
            save: saveMock,
          };
        }
        throw new Error("unexpected entity");
      },
    } as never);
  });

  it("stores null when category is cleared", async () => {
    const result = await updateDocumentMetadata("doc-meta", TEST_CTX, { category: null });

    expect(result?.category).toBeNull();
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
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
