/**
 * Agent 侧 LangSmith：fail-open；LANGSMITH_TRACING=true + API key 时启用。
 * LangGraph / LangChain 会按环境变量自动上报；此处统一 project 默认值。
 */

let configured = false;

/** 配置 env；未启用时返回 false（调用方照常执行，不抛错） */
export function ensureAgentLangSmithEnv(): boolean {
  if (configured) return true;

  const key = process.env.LANGSMITH_API_KEY?.trim();
  const tracingOn = process.env.LANGSMITH_TRACING === "true";

  if (!key || !tracingOn) {
    return false;
  }

  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = key;
  if (!process.env.LANGSMITH_PROJECT?.trim()) {
    process.env.LANGSMITH_PROJECT = "personal-gpt-agent";
  }

  configured = true;
  return true;
}

export function isAgentLangSmithActive(): boolean {
  return ensureAgentLangSmithEnv();
}

/** 可选包装：无 key 时直接跑 fn */
export async function traceAgentRun<T>(
  name: string,
  metadata: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ensureAgentLangSmithEnv()) {
    return fn();
  }

  const { traceable } = await import("langsmith/traceable");
  const clean = Object.fromEntries(
    Object.entries(metadata).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0,
    ),
  );
  const wrapped = traceable(fn, { name, metadata: clean });
  return wrapped();
}

/** 测试用：重置单例 */
export function resetAgentLangSmithConfigForTests(): void {
  configured = false;
}
