export const EXTERNAL_TOOL_TIMEOUT_MS = 8_000;

/** Race external tool/IO with timeout + abort; rejections/timeouts → undefined. */
export async function raceExternalCall<T>(
  promise: Promise<T>,
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T | undefined> {
  const timeoutMs = opts.timeoutMs ?? EXTERNAL_TOOL_TIMEOUT_MS;
  const { signal } = opts;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guarded = promise.catch(() => undefined as T);
  try {
    return await Promise.race([
      guarded,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
        timer.unref?.();
      }),
      new Promise<undefined>((resolve) => {
        if (signal?.aborted) {
          resolve(undefined);
          return;
        }
        onAbort = () => resolve(undefined);
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
