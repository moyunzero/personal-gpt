/**
 * LangSmith 追踪封装（ENG-01）：API key 缺失时 fail-open，不阻塞 ingest。
 */

let configured = false;

export interface IngestTraceContext {
  workspaceId: string;
  documentId: string;
  requestId?: string;
}

export type IngestTraceStep = "parse" | "split" | "embed" | "upsert";

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
    process.env.LANGSMITH_PROJECT = "personal-gpt-phase1";
  }

  configured = true;
  return true;
}

export function isLangSmithTracingActive(): boolean {
  return ensureLangSmithEnv();
}

function cleanMetadata(
  meta: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(meta).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

/** 包装 ingest pipeline 单步（parse / split / embed / upsert） */
export async function traceIngestStep<T>(
  step: IngestTraceStep,
  ctx: IngestTraceContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ensureLangSmithEnv()) {
    return fn();
  }

  const { traceable } = await import("langsmith/traceable");
  const wrapped = traceable(fn, {
    name: `ingest.${step}`,
    metadata: cleanMetadata({
      workspaceId: ctx.workspaceId,
      documentId: ctx.documentId,
      requestId: ctx.requestId,
      step,
    }),
  });
  return wrapped();
}
