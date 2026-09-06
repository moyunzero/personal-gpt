import { describe, expect, it, vi } from "vitest";

import { combineAbortSignals, createUpstreamTimeoutSignal } from "./abort-signals";
import { pipeUpstreamBody } from "./pipe-upstream";

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
    try {
      const { signal, clear } = createUpstreamTimeoutSignal(1000);
      expect(signal.aborted).toBe(false);
      clear();
      await vi.advanceTimersByTimeAsync(2000);
      expect(signal.aborted).toBe(false);

      const second = createUpstreamTimeoutSignal(500);
      await vi.advanceTimersByTimeAsync(500);
      expect(second.signal.aborted).toBe(true);
      second.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pipeUpstreamBody", () => {
  it("keeps timeout armed until body completes, then clears", async () => {
    vi.useFakeTimers();
    const client = new AbortController();
    const timeout = createUpstreamTimeoutSignal(1000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      let pullCount = 0;
      const upstream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCount += 1;
          if (pullCount === 1) {
            controller.enqueue(new TextEncoder().encode("chunk"));
            return;
          }
          // hang until cancelled / never close — simulates headers-ok body-stall
        },
      });

      const out = pipeUpstreamBody(upstream, {
        clientSignal: client.signal,
        timeout,
      });
      reader = out.getReader();

      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(timeout.signal.aborted).toBe(false);

      const pending = reader.read();
      // 先挂上 rejection 处理，再推进超时，避免 unhandled rejection
      const expectTimeout = expect(pending).rejects.toThrow(/取消或超时/);
      await vi.advanceTimersByTimeAsync(1000);
      expect(timeout.signal.aborted).toBe(true);
      await expectTimeout;
    } finally {
      await reader?.cancel().catch(() => {});
      timeout.clear();
      vi.useRealTimers();
    }
  });

  it("closes cleanly when client disconnects (not timeout error)", async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("a"));
      },
      cancel() {
        cancelled = true;
      },
    });

    const client = new AbortController();
    const timeout = createUpstreamTimeoutSignal(60_000);
    const out = pipeUpstreamBody(upstream, {
      clientSignal: client.signal,
      timeout,
    });
    const reader = out.getReader();
    await reader.read();
    client.abort();
    const next = await reader.read();
    expect(next.done).toBe(true);
    expect(cancelled).toBe(true);
    timeout.clear();
  });
});
