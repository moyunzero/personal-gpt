/**
 * D-15 硬上限：子 Agent / 工具调用护栏（与 prompt 双写）。
 */

/** Researcher 单次任务 web_search 次数上限 */
export const MAX_WEB_SEARCH_CALLS_PER_TASK = 10;

/** Supervisor 并行调研主题 / Researcher 实例上限 */
export const MAX_PARALLEL_RESEARCH_TOPICS = 3;

/** 文档化：各 Agent 允许的 tool 名（caps 单测对齐） */
export const AGENT_TOOL_CAPS = {
  retriever: ["kb_search"] as const,
  researcher: ["web_search"] as const,
  analyst: ["calculator"] as const,
  editor: [] as const,
  supervisor: [] as const,
} as const;
