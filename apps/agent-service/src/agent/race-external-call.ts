export const EXTERNAL_TOOL_TIMEOUT_MS = 8_000;

export type RaceExternalResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error" | "abort" };

export function raceValue<T>(result: RaceExternalResult<T>): T | undefined {
  return result.ok ? result.value : undefined;
}

/** Race external tool/IO with timeout + abort; rejections/timeouts → { ok:false }. */
export async function raceExternalCall<T>(
  promise: Promise<T>,
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<RaceExternalResult<T>> {
  const timeoutMs = opts.timeoutMs ?? EXTERNAL_TOOL_TIMEOUT_MS;
  const { signal } = opts;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let settled: RaceExternalResult<T> | undefined;

  const guarded = promise.then(
    (value) => {
      settled = { ok: true, value };
      return settled;
    },
    () => {
      settled = { ok: false, reason: "error" };
      return settled;
    },
  );

  try {
    const raced = await Promise.race([
      guarded,
      new Promise<RaceExternalResult<T>>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
        timer.unref?.();
      }),
      new Promise<RaceExternalResult<T>>((resolve) => {
        if (signal?.aborted) {
          resolve({ ok: false, reason: "abort" });
          return;
        }
        onAbort = () => resolve({ ok: false, reason: "abort" });
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
    return raced;
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    void settled;
  }
}
