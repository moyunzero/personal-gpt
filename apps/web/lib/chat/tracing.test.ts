import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const traceableMock = vi.fn();

describe("traceRetrieveStep (ENG-01)", () => {
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
    const { traceRetrieveStep } = await import("./tracing");
    const fn = vi.fn().mockResolvedValue({ hits: 3 });

    await expect(
      traceRetrieveStep("search", { workspaceId: "ws-1", requestId: "req-1" }, fn),
    ).resolves.toEqual({ hits: 3 });

    expect(fn).toHaveBeenCalledOnce();
    expect(traceableMock).not.toHaveBeenCalled();
  });

  it("calls traceable when key and LANGSMITH_TRACING=true", async () => {
    process.env.LANGSMITH_API_KEY = "ls-test-key";
    process.env.LANGSMITH_TRACING = "true";

    traceableMock.mockImplementation((fn, opts) => {
      expect(opts).toMatchObject({
        name: "retrieve.embed",
        metadata: {
          workspaceId: "ws-1",
          requestId: "req-1",
          step: "embed",
        },
      });
      return fn;
    });

    vi.doMock("langsmith/traceable", () => ({
      traceable: traceableMock,
    }));

    const { traceRetrieveStep } = await import("./tracing");
    const fn = vi.fn().mockResolvedValue("embedded");

    await expect(
      traceRetrieveStep("embed", { workspaceId: "ws-1", requestId: "req-1" }, fn),
    ).resolves.toBe("embedded");

    expect(traceableMock).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });
});
