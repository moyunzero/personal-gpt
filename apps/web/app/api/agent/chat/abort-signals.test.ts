import { describe, expect, it, vi } from "vitest";

import { combineAbortSignals, createUpstreamTimeoutSignal } from "./abort-signals";

describe("agent BFF abort signals", () => {
  it("combineAbortSignals aborts when any input aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineAbortSignals(a.signal, b.signal);
    expect(combined?.aborted).toBe(false);
    b.abort();
    expect(combined?.aborted).toBe(true);
  });

  it("createUpstreamTimeoutSignal aborts after timeout and clear prevents fire", async () => {
    vi.useFakeTimers();
    const { signal, clear } = createUpstreamTimeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    clear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(signal.aborted).toBe(false);

    const second = createUpstreamTimeoutSignal(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(second.signal.aborted).toBe(true);
    second.clear();
    vi.useRealTimers();
  });
});
