import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getUploadsDir } from "@personal-gpt/shared/utils/paths";

const statMock = vi.fn();
const deleteByDocumentMock = vi.fn();

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: (...args: unknown[]) => statMock(...args),
  };
});

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/tracing", () => ({
  traceIngestStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

// Failure cleanup calls deleteDocument → Astra; keep CI off the dummy endpoint.
vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createAstraVectorStore: () => ({
    search: vi.fn(),
    upsert: vi.fn(),
    deleteByDocument: (...args: unknown[]) => deleteByDocumentMock(...args),
  }),
  createVectorStore: () => ({
    search: vi.fn(),
    upsert: vi.fn(),
    deleteByDocument: (...args: unknown[]) => deleteByDocumentMock(...args),
  }),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/es-upsert", () => ({
  deleteDocumentFromEs: vi.fn().mockResolvedValue(undefined),
  upsertChunksToEs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    deleteGraphForDocument: vi.fn().mockResolvedValue(undefined),
    deleteCatalogForDocument: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@personal-gpt/shared/stores/vector-store", () => ({
  shouldWriteAstra: () => true,
  shouldWriteMilvus: () => false,
}));

vi.mock("../../../apps/ingest-worker/src/ingest/entity-catalog-store", () => ({
  createEntityCatalogStore: () => ({}),
}));

import { IngestProcessor } from "../../../apps/ingest-worker/src/ingest/ingest.processor";
import { parseDocumentUnsafe } from "../../../apps/ingest-worker/src/ingest/pipeline/parse";

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const CORRUPT_PDF = path.join(FIXTURE_DIR, "corrupt.pdf");
const UPLOADS_CORRUPT_PDF = path.join(getUploadsDir(), "regression-phase1-corrupt.pdf");

describe("Phase 1 regression #5: corrupt PDF → failed job with visible error", () => {
  let documentUpdateMock: ReturnType<typeof vi.fn>;
  let ingestJobUpdateMock: ReturnType<typeof vi.fn>;
  let processor: IngestProcessor;

  beforeAll(async () => {
    await fs.mkdir(getUploadsDir(), { recursive: true });
    await fs.copyFile(CORRUPT_PDF, UPLOADS_CORRUPT_PDF);
  });

  afterAll(async () => {
    await fs.unlink(UPLOADS_CORRUPT_PDF).catch(() => undefined);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    statMock.mockResolvedValue({ size: 1024, isFile: () => true });
    deleteByDocumentMock.mockResolvedValue(undefined);

    documentUpdateMock = vi.fn().mockResolvedValue(undefined);
    ingestJobUpdateMock = vi.fn().mockResolvedValue(undefined);

    processor = new IngestProcessor(
      {
        update: documentUpdateMock,
        findOne: vi.fn(),
      } as never,
      {
        findOne: vi.fn().mockResolvedValue({ id: "job-fail-1" }),
        update: ingestJobUpdateMock,
      } as never,
    );
  });

  it("parseDocumentUnsafe rejects corrupt PDF fixture", async () => {
    const buffer = await fs.readFile(CORRUPT_PDF);
    expect(buffer.length).toBeGreaterThan(0);

    await expect(parseDocumentUnsafe(CORRUPT_PDF, "application/pdf")).rejects.toThrow();
  });

  it("ingest processor marks document failed and persists error message", async () => {
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const documentId = "44444444-4444-4444-8444-444444444444";

    const job = {
      id: "bull-fail",
      name: "ingest",
      data: {
        workspaceId,
        documentId,
        filePath: UPLOADS_CORRUPT_PDF,
        mimeType: "application/pdf",
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toThrow();

    const failedDocUpdate = documentUpdateMock.mock.calls.find(
      (call) => call[1]?.status === "failed",
    );
    expect(failedDocUpdate).toBeDefined();

    const failedJobUpdate = ingestJobUpdateMock.mock.calls.find(
      (call) => call[1]?.status === "failed" && call[1]?.error,
    );
    expect(failedJobUpdate).toBeDefined();
    expect(String(failedJobUpdate?.[1]?.error).length).toBeGreaterThan(0);
  });
});
