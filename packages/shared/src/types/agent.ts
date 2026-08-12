/**
 * Agent 模式跨端类型（web / agent-service）。
 * Phase 2：todo 进度、步骤面板、chat body 约定。
 */

/** 单条 todo（Supervisor / 前端步骤面板） */
export type TodoStatus = "pending" | "active" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

/** SSE / UI 自定义 part：子 Agent 执行步骤 */
export type AgentStepStatus = "pending" | "active" | "completed" | "error";

export interface AgentStepEvent {
  id: string;
  agent: string;
  title: string;
  status: AgentStepStatus;
  summary?: string;
}

/**
 * UIMessage 兼容的最小结构（与 Vercel AI SDK `UIMessage` 对齐字段）。
 * 完整 UIMessage 由 `ai` 包提供；此处避免 shared 强制再导出 UI 细节。
 */
export interface AgentUIMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts?: unknown[];
  content?: string;
  [key: string]: unknown;
}

/**
 * `POST /agent/chat` 请求体约定。
 * - messages：与 useChat / agui 一致的 UIMessage 列表
 * - thread_id：可选；checkpointer 会话键
 * - workspaceId：可选；缺省 `default`（D-00d）
 */
export interface AgentChatRequest {
  messages: AgentUIMessage[];
  thread_id?: string;
  workspaceId?: string;
}

/** 与计划 must_haves 命名对齐的别名 */
export type AgentChatBody = AgentChatRequest;
