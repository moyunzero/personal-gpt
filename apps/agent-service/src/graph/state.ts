/**
 * Agent 外层 StateGraph Annotation（todos / workspace / citations）。
 * messages 使用 MessagesAnnotation；workspaceId 默认 `default`（D-00d）。
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { Citation, TodoItem } from "@personal-gpt/shared";

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  todos: Annotation<TodoItem[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  workspaceId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "default",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** 外层路由：short | supervisor */
  route: Annotation<"short" | "supervisor">({
    reducer: (_prev, next) => next,
    default: () => "supervisor",
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
