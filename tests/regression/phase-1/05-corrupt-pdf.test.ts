import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const statMock = vi.fn();

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: (...args: unknown[]) => statMock(...args),
  };
});

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/tracing", () => ({
  traceIngestStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) =>
    fn(),
}));

import { IngestProcessor } from "../../../apps/ingest-worker/src/ingest/ingest.processor";
import { parseDocumentUnsafe } from "../../../apps/ingest-worker/src/ingest/pipeline/parse";

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const CORRUPT_PDF = path.join(FIXTURE_DIR, "corrupt.pdf");

describe("Phase 1 regression #5: corrupt PDF → failed job with visible error", () => {
  let documentUpdateMock: ReturnType<typeof vi.fn>;
  let ingestJobUpdateMock: ReturnType<typeof vi.fn>;
  let processor: IngestProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    statMock.mockResolvedValue({ size: 1024 });

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

    await expect(
      parseDocumentUnsafe(CORRUPT_PDF, "application/pdf"),
    ).rejects.toThrow();
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
        filePath: CORRUPT_PDF,
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
