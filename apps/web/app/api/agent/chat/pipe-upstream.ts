/** Pipe agent-service SSE body while honouring client disconnect + upstream timeout. */
export function pipeUpstreamBody(
  upstreamBody: ReadableStream<Uint8Array>,
  opts: {
    clientSignal: AbortSignal;
    timeout: { signal: AbortSignal; clear: () => void };
  },
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    opts.timeout.clear();
  };

  const cancelReader = () => {
    void reader.cancel().catch(() => {});
  };

  const onAbort = () => {
    cancelReader();
    cleanup();
  };

  if (opts.clientSignal.aborted || opts.timeout.signal.aborted) {
    cancelReader();
    cleanup();
  } else {
    opts.clientSignal.addEventListener("abort", onAbort, { once: true });
    opts.timeout.signal.addEventListener("abort", onAbort, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (opts.timeout.signal.aborted) {
          cancelReader();
          cleanup();
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          cancelReader();
          cleanup();
          controller.close();
          return;
        }
        const { done, value } = await reader.read();
        if (opts.timeout.signal.aborted) {
          cancelReader();
          cleanup();
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          cancelReader();
          cleanup();
          controller.close();
          return;
        }
        if (done) {
          cleanup();
          controller.close();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (err) {
        cleanup();
        cancelReader();
        if (opts.timeout.signal.aborted) {
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          controller.close();
          return;
        }
        controller.error(err);
      }
    },
    cancel() {
      cancelReader();
      cleanup();
    },
  });
}
