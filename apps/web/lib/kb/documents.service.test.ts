import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { DocumentEntity } from "@/lib/db/entities/document.entity";
import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import { getDataSource } from "@/lib/db/get-data-source";
import {
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

function makeFile(overrides: Partial<{
  name: string;
  type: string;
  size: number;
}> = {}) {
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
    saveMock.mockImplementation(async (entity: { id?: string; status?: string }) => {
      if (entity.status === "pending") return documentEntity;
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
    const { document, job } = await uploadDocument(makeFile());

    expect(document.status).toBe("pending");
    expect(job?.id).toBe("job-uuid");
    expect(queueAddMock).toHaveBeenCalledWith(
      expect.stringContaining("ingest-doc-uuid"),
      expect.objectContaining({
        documentId: "doc-uuid",
        mimeType: "application/pdf",
      }),
    );
    expect(jobUpdateMock).toHaveBeenCalledWith(
      { id: "job-uuid" },
      { bullJobId: "bull-123" },
    );
  });
});
