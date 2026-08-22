/**
 * Agent BFF：合并客户端 AbortSignal 与上游超时。
 */
export function combineAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => Boolean(s));
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(list);
  }
  const ac = new AbortController();
  const onAbort = () => {
    if (!ac.signal.aborted) ac.abort();
  };
  for (const s of list) {
    if (s.aborted) {
      ac.abort();
      return ac.signal;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }
  return ac.signal;
}

export const AGENT_UPSTREAM_TIMEOUT_MS = (() => {
  const raw = Number(process.env.AGENT_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
})();

export function createUpstreamTimeoutSignal(ms = AGENT_UPSTREAM_TIMEOUT_MS): {
  signal: AbortSignal;
  clear: () => void;
} {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  timer.unref?.();
  return {
    signal: ac.signal,
    clear: () => clearTimeout(timer),
  };
}
