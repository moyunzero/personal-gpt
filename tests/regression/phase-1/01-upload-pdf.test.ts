import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();
const splitMock = vi.fn();
const embedMock = vi.fn();
const upsertMock = vi.fn();
const statMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => statMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/parse", () => ({
  parseDocument: (...args: unknown[]) => parseMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/split", () => ({
  splitText: (...args: unknown[]) => splitMock(...args),
  toChunkRecords: (
    chunks: string[],
    vectors: number[][],
    meta: { workspaceId: string; documentId: string },
  ) =>
    chunks.map((text, index) => ({
      text,
      vector: vectors[index]!,
      workspaceId: meta.workspaceId,
      documentId: meta.documentId,
      chunkIndex: index,
    })),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/embed", () => ({
  embedChunks: (...args: unknown[]) => embedMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/upsert", () => ({
  upsertChunks: (...args: unknown[]) => upsertMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/graph-extract", () => ({
  extractAndUpsertGraph: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/tracing", () => ({
  traceIngestStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

import { IngestProcessor } from "../../../apps/ingest-worker/src/ingest/ingest.processor";

describe("Phase 1 regression #1: upload PDF → ready with chunks", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const documentId = "22222222-2222-4222-8222-222222222222";
  const filePath = "/tmp/uploads/sample.pdf";

  let documentUpdateMock: ReturnType<typeof vi.fn>;
  let documentFindOneMock: ReturnType<typeof vi.fn>;
  let ingestJobUpdateMock: ReturnType<typeof vi.fn>;
  let processor: IngestProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    statMock.mockResolvedValue({ size: 5 * 1024 * 1024 });
    parseMock.mockResolvedValue("Personal GPT knowledge base fixture content.");
    splitMock.mockResolvedValue(["chunk-a", "chunk-b", "chunk-c"]);
    embedMock.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
    upsertMock.mockResolvedValue(undefined);

    documentUpdateMock = vi.fn().mockResolvedValue(undefined);
    documentFindOneMock = vi.fn().mockResolvedValue({
      id: documentId,
      title: "Sample PDF",
      source: "sample.pdf",
      category: null,
      tags: [],
    });
    ingestJobUpdateMock = vi.fn().mockResolvedValue(undefined);

    processor = new IngestProcessor(
      {
        update: documentUpdateMock,
        findOne: documentFindOneMock,
      } as never,
      {
        findOne: vi.fn().mockResolvedValue({ id: "job-1" }),
        update: ingestJobUpdateMock,
      } as never,
    );
  });

  it("marks document ready with chunk_count > 0 after ingest pipeline", async () => {
    const job = {
      id: "bull-1",
      name: "ingest",
      data: {
        workspaceId,
        documentId,
        filePath,
        mimeType: "application/pdf",
        title: "Sample PDF",
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await processor.process(job as never);

    expect(parseMock).toHaveBeenCalledWith(filePath, "application/pdf");
    expect(splitMock).toHaveBeenCalled();
    expect(embedMock).toHaveBeenCalledWith(["chunk-a", "chunk-b", "chunk-c"]);
    expect(upsertMock).toHaveBeenCalled();

    const readyUpdate = documentUpdateMock.mock.calls.find((call) => call[1]?.status === "ready");
    expect(readyUpdate).toBeDefined();
    expect(readyUpdate?.[1]?.chunkCount).toBeGreaterThan(0);

    const completedJob = ingestJobUpdateMock.mock.calls.find(
      (call) => call[1]?.status === "completed",
    );
    expect(completedJob).toBeDefined();
    expect(completedJob?.[1]?.progress).toBe(100);
  });
});
