import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();
const splitMock = vi.fn();
const embedMock = vi.fn();
const upsertMock = vi.fn();
const graphExtractMock = vi.fn();
const deleteDocumentMock = vi.fn();
const statMock = vi.fn();
const traceSteps: string[] = [];

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
  extractAndUpsertGraph: (...args: unknown[]) => graphExtractMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/delete", () => ({
  deleteDocument: (...args: unknown[]) => deleteDocumentMock(...args),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/tracing", () => ({
  traceIngestStep: (step: string, _ctx: unknown, fn: () => Promise<unknown>) => {
    traceSteps.push(step);
    return fn();
  },
}));

import { IngestProcessor } from "../../../apps/ingest-worker/src/ingest/ingest.processor";

describe("Phase 4 regression #1: ingest graph-extract step", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const documentId = "33333333-3333-4333-8333-333333333333";
  const filePath = "/tmp/uploads/graph-fixture.pdf";
  const chunks = ["Alice works at Acme.", "Acme builds products."];

  let documentUpdateMock: ReturnType<typeof vi.fn>;
  let documentFindOneMock: ReturnType<typeof vi.fn>;
  let ingestJobUpdateMock: ReturnType<typeof vi.fn>;
  let jobProgressMock: ReturnType<typeof vi.fn>;
  let processor: IngestProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    traceSteps.length = 0;
    process.env.ENABLE_GRAPH_RAG = "true";

    statMock.mockResolvedValue({ size: 1024 });
    parseMock.mockResolvedValue("fixture text");
    splitMock.mockResolvedValue(chunks);
    embedMock.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    upsertMock.mockResolvedValue(undefined);
    graphExtractMock.mockResolvedValue(undefined);
    deleteDocumentMock.mockResolvedValue(undefined);

    documentUpdateMock = vi.fn().mockResolvedValue(undefined);
    documentFindOneMock = vi.fn().mockResolvedValue({
      id: documentId,
      title: "Graph Fixture",
      source: "graph-fixture.pdf",
      category: null,
      tags: [],
    });
    ingestJobUpdateMock = vi.fn().mockResolvedValue(undefined);
    jobProgressMock = vi.fn().mockResolvedValue(undefined);

    processor = new IngestProcessor(
      {
        update: documentUpdateMock,
        findOne: documentFindOneMock,
      } as never,
      {
        findOne: vi.fn().mockResolvedValue({ id: "job-graph-1" }),
        update: ingestJobUpdateMock,
      } as never,
      {} as never,
    );
  });

  it("skips graph-extract when ENABLE_GRAPH_RAG is not true", async () => {
    process.env.ENABLE_GRAPH_RAG = "false";

    const job = {
      id: "bull-graph-skip",
      name: "ingest",
      data: {
        workspaceId,
        documentId,
        filePath,
        mimeType: "application/pdf",
        title: "Graph Fixture",
      },
      updateProgress: jobProgressMock,
    };

    await processor.process(job as never);

    expect(graphExtractMock).not.toHaveBeenCalled();
    expect(traceSteps).not.toContain("graph-extract");
    const readyUpdate = documentUpdateMock.mock.calls.find((call) => call[1]?.status === "ready");
    expect(readyUpdate).toBeDefined();
  });

  it("invokes graph-extract after upsert and before ready (75→90→100)", async () => {
    const job = {
      id: "bull-graph-1",
      name: "ingest",
      data: {
        workspaceId,
        documentId,
        filePath,
        mimeType: "application/pdf",
        title: "Graph Fixture",
      },
      updateProgress: jobProgressMock,
    };

    await processor.process(job as never);

    expect(traceSteps.indexOf("upsert")).toBeLessThan(traceSteps.indexOf("graph-extract"));
    expect(graphExtractMock).toHaveBeenCalledWith(
      {
        workspaceId,
        documentId,
        chunks,
      },
      { dataSource: expect.anything() },
    );
    expect(jobProgressMock.mock.calls.map((call) => call[0])).toEqual([0, 25, 50, 75, 90, 100]);

    const readyUpdate = documentUpdateMock.mock.calls.find((call) => call[1]?.status === "ready");
    expect(readyUpdate).toBeDefined();
    expect(readyUpdate?.[1]?.chunkCount).toBe(chunks.length);
  });

  it("marks document failed when graph-extract throws (D-09)", async () => {
    graphExtractMock.mockRejectedValue(new Error("neo4j unavailable"));

    const job = {
      id: "bull-graph-fail",
      name: "ingest",
      data: {
        workspaceId,
        documentId,
        filePath,
        mimeType: "application/pdf",
      },
      updateProgress: jobProgressMock,
    };

    await expect(processor.process(job as never)).rejects.toThrow("neo4j unavailable");

    expect(deleteDocumentMock).toHaveBeenCalledWith(workspaceId, documentId, "user", {
      dataSource: expect.anything(),
    });
    const failedDocUpdate = documentUpdateMock.mock.calls.find(
      (call) => call[1]?.status === "failed",
    );
    expect(failedDocUpdate).toBeDefined();
    expect(documentUpdateMock.mock.calls.some((call) => call[1]?.status === "ready")).toBe(false);
  });
});
