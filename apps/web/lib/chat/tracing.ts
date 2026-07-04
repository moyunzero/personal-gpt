/**
 * LangSmith 追踪封装（ENG-01）：retrieve 链路；无 key 时 no-op fail-open。
 */

let configured = false;

export interface RetrieveTraceContext {
  workspaceId: string;
  requestId: string;
}

export type RetrieveTraceStep = "embed" | "search";

function ensureLangSmithEnv(): boolean {
  if (configured) return true;

  const key = process.env.LANGSMITH_API_KEY?.trim();
  const tracingOn = process.env.LANGSMITH_TRACING === "true";

  if (!key || !tracingOn) {
    return false;
  }

  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = key;
  if (!process.env.LANGSMITH_PROJECT?.trim()) {
    process.env.LANGSMITH_PROJECT = "personal-gpt-gemini";
  }

  configured = true;
  return true;
}

export function isLangSmithTracingActive(): boolean {
  return ensureLangSmithEnv();
}

function cleanMetadata(meta: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(meta).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

/** 包装 retrieve 入口或子步骤 */
export async function traceRetrieveStep<T>(
  step: RetrieveTraceStep | "retrieve",
  ctx: RetrieveTraceContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ensureLangSmithEnv()) {
    return fn();
  }

  const { traceable } = await import("langsmith/traceable");
  const wrapped = traceable(fn, {
    name: step === "retrieve" ? "retrieve.search" : `retrieve.${step}`,
    metadata: cleanMetadata({
      workspaceId: ctx.workspaceId,
      requestId: ctx.requestId,
      step,
    }),
  });
  return wrapped();
}
