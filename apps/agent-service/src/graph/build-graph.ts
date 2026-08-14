/**
 * AGENT-01 图内核：外层闲聊短路 StateGraph + 内层 createSupervisor hub-and-spoke。
 *
 * 禁止：继续 fetch WEB_URL/api/chat（D-00b）；禁止引入 deepagents。
 *
 * GraphRecursionError（D-15）：invoke/stream 层捕获后应返回已产生的部分 messages /
 * 可读降级文案；完整流式接线在 02-04。本模块提供 getAgentRunConfig 注入 recursionLimit。
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import {
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { createSupervisor } from "@langchain/langgraph-supervisor";

import { createAnalystAgent } from "../agents/analyst.agent";
import { createEditorAgent } from "../agents/editor.agent";
import { createResearcherAgent } from "../agents/researcher.agent";
import { createRetrieverAgent } from "../agents/retriever.agent";
import { buildSupervisorPrompt } from "../agents/supervisor.prompt";
import { createChatModel } from "../providers/chat-model.provider";
import {
  findSkill,
  formatSkillForPrompt,
  formatSkillsForPrompt,
  loadEnabledSkills,
} from "../skills/load-skills";
import { resetWebSearchCallCount } from "../tools/web-search.tool";
import {
  buildShortReplyMessages,
  isAgentChitchat,
} from "./short-circuit";
import { AgentState, type AgentStateType } from "./state";

export type AgentRoute = "short" | "supervisor";

export type BuildAgentGraphOptions = {
  /** 注入模型（测试用 mock）；缺省 createChatModel() */
  model?: LanguageModelLike;
  /** 覆盖 checkpointer；缺省按 AGENT_CHECKPOINTER 解析 */
  checkpointer?: BaseCheckpointSaver;
  /** 当前用户原文：注入 Supervisor 强制调度清单 */
  userText?: string;
};

export type AgentRunConfig = {
  recursionLimit: number;
  configurable: { thread_id: string };
};

const DEFAULT_RECURSION_LIMIT = 40;

/** 从 messages 取最近一条用户文本（用于路由） */
export function lastUserText(messages: BaseMessage[] | undefined): string {
  if (!messages?.length) {
    return "";
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = (m as { getType?: () => string }).getType?.() ?? "";
    if (role === "human" || (m as { role?: string }).role === "user") {
      const c = m.content;
      return typeof c === "string" ? c : JSON.stringify(c);
    }
  }
  const last = messages[messages.length - 1];
  const c = last?.content;
  return typeof c === "string" ? c : "";
}

/** 纯函数路由：可单测（闲聊 → short，否则 supervisor） */
export function resolveAgentRoute(text: string): AgentRoute {
  return isAgentChitchat(text) ? "short" : "supervisor";
}

/**
 * invoke/stream 运行配置：recursionLimit（D-15）+ 必填 thread_id（D-08）。
 */
export function getAgentRunConfig(threadId: string): AgentRunConfig {
  if (!threadId?.trim()) {
    throw new Error("configurable.thread_id 必填（MemorySaver / checkpointer 会话键）");
  }
  const raw = process.env.AGENT_RECURSION_LIMIT;
  const parsed = raw ? Number(raw) : DEFAULT_RECURSION_LIMIT;
  const recursionLimit =
    Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_RECURSION_LIMIT;
  return {
    recursionLimit,
    configurable: { thread_id: threadId.trim() },
  };
}

async function resolveCheckpointer(
  override?: BaseCheckpointSaver,
): Promise<BaseCheckpointSaver> {
  if (override) {
    return override;
  }
  const mode = (process.env.AGENT_CHECKPOINTER ?? "memory").toLowerCase();
  if (mode === "sqlite") {
    const { mkdirSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { SqliteSaver } = await import(
      "@langchain/langgraph-checkpoint-sqlite"
    );
    const dbPath =
      process.env.AGENT_CHECKPOINTER_SQLITE_PATH?.trim() ||
      resolve(process.cwd(), ".data/agent-checkpoints.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true });
    // SqliteSaver 与当前 BaseCheckpointSaver 泛型略有漂移；运行时可用
    return SqliteSaver.fromConnString(dbPath) as unknown as BaseCheckpointSaver;
  }
  return new MemorySaver();
}

function routerNode(state: AgentStateType) {
  const text = lastUserText(state.messages);
  return { route: resolveAgentRoute(text) };
}

function shortReplyNode(state: AgentStateType) {
  const text = lastUserText(state.messages);
  return { messages: buildShortReplyMessages(text) };
}

/**
 * 编译外层短路图 + 内层 Supervisor。默认 MemorySaver checkpointer。
 */
export async function buildAgentGraph(options: BuildAgentGraphOptions = {}) {
  const model = options.model ?? createChatModel();
  const checkpointer = await resolveCheckpointer(options.checkpointer);

  resetWebSearchCallCount();

  const skills = loadEnabledSkills();
  const retriever = createRetrieverAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "kb-retrieval")),
  });
  const researcher = createResearcherAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "web-research")),
  });
  const analyst = createAnalystAgent(model);
  const editor = createEditorAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "report-writer")),
  });

  const supervisorWorkflow = createSupervisor({
    agents: [
      retriever.graph,
      researcher.graph,
      analyst.graph,
      editor.graph,
    ],
    llm: model,
    prompt: buildSupervisorPrompt(
      formatSkillsForPrompt(skills),
      options.userText ?? "",
    ),
  });

  const supervisorSubgraph = supervisorWorkflow.compile({ checkpointer });

  const graph = new StateGraph(AgentState)
    .addNode("router", routerNode)
    .addNode("short_reply", shortReplyNode)
    .addNode("supervisor_subgraph", supervisorSubgraph)
    .addEdge(START, "router")
    .addConditionalEdges("router", (state) => state.route, {
      short: "short_reply",
      supervisor: "supervisor_subgraph",
    })
    .addEdge("short_reply", END)
    .addEdge("supervisor_subgraph", END)
    .compile({ checkpointer });

  return graph;
}

/**
 * 构建 supervisor 子图（用于直接 stream，绕过外层 StateGraph 嵌套问题）。
 * toUIMessageStream 只能处理扁平 LangGraph stream，嵌套子图的消息不会穿透。
 */
export async function buildSupervisorGraph(options: BuildAgentGraphOptions = {}) {
  const model = options.model ?? createChatModel();
  const checkpointer = await resolveCheckpointer(options.checkpointer);

  resetWebSearchCallCount();

  const skills = loadEnabledSkills();
  const retriever = createRetrieverAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "kb-retrieval")),
  });
  const researcher = createResearcherAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "web-research")),
  });
  const analyst = createAnalystAgent(model);
  const editor = createEditorAgent(model, {
    skillPrompt: formatSkillForPrompt(findSkill(skills, "report-writer")),
  });

  const supervisorWorkflow = createSupervisor({
    agents: [
      retriever.graph,
      researcher.graph,
      analyst.graph,
      editor.graph,
    ],
    llm: model,
    prompt: buildSupervisorPrompt(
      formatSkillsForPrompt(skills),
      options.userText ?? "",
    ),
  });

  return supervisorWorkflow.compile({ checkpointer });
}

/** @deprecated 使用 buildAgentGraph；保留别名避免旧 smoke 误导 */
export const buildGraph = buildAgentGraph;
