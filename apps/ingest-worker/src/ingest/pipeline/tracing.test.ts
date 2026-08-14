import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const traceableMock = vi.fn();

describe("traceIngestStep (ENG-01)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    traceableMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGSMITH_TRACING;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.doUnmock("langsmith/traceable");
  });

  it("runs fn without throwing when LANGSMITH_API_KEY is missing (fail-open)", async () => {
    const { traceIngestStep } = await import("./tracing");
    const fn = vi.fn().mockResolvedValue(["chunk-a"]);

    await expect(
      traceIngestStep(
        "split",
        { workspaceId: "ws-1", documentId: "doc-1", requestId: "req-1" },
        fn,
      ),
    ).resolves.toEqual(["chunk-a"]);

    expect(fn).toHaveBeenCalledOnce();
    expect(traceableMock).not.toHaveBeenCalled();
  });

  it("calls traceable when key and LANGSMITH_TRACING=true", async () => {
    process.env.LANGSMITH_API_KEY = "ls-test-key";
    process.env.LANGSMITH_TRACING = "true";

    traceableMock.mockImplementation((fn, opts) => {
      expect(opts).toMatchObject({
        name: "ingest.parse",
        metadata: {
          workspaceId: "ws-1",
          documentId: "doc-1",
          requestId: "req-1",
          step: "parse",
        },
      });
      return fn;
    });

    vi.doMock("langsmith/traceable", () => ({
      traceable: traceableMock,
    }));

    const { traceIngestStep } = await import("./tracing");
    const fn = vi.fn().mockResolvedValue({ pages: 2 });

    await expect(
      traceIngestStep(
        "parse",
        { workspaceId: "ws-1", documentId: "doc-1", requestId: "req-1" },
        fn,
      ),
    ).resolves.toEqual({ pages: 2 });

    expect(traceableMock).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });
});
