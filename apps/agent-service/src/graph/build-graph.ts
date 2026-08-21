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
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { createSupervisor } from "@langchain/langgraph-supervisor";

import { createAnalystAgent } from "../agents/analyst.agent";
import { createEditorAgent } from "../agents/editor.agent";
import { createResearcherAgent } from "../agents/researcher.agent";
import { createRetrieverAgent } from "../agents/retriever.agent";
import {
  buildSupervisorPrompt,
  inferRequiredSpecialists,
  type SpecialistName,
} from "../agents/supervisor.prompt";
import { createChatModel } from "../providers/chat-model.provider";
import {
  findSkill,
  formatSkillForPrompt,
  formatSkillsOverview,
  loadEnabledSkills,
} from "../skills/load-skills";
import { buildShortReplyMessages, isAgentChitchat } from "./short-circuit";
import { AgentState, type AgentStateType } from "./state";

export type AgentRoute = "short" | "supervisor";

export type BuildAgentGraphOptions = {
  /** 注入模型（测试用 mock）；缺省 createChatModel() */
  model?: LanguageModelLike;
  /** 覆盖 checkpointer；缺省按 AGENT_CHECKPOINTER 解析（进程单例） */
  checkpointer?: BaseCheckpointSaver;
  /** 当前用户原文：注入 Supervisor 强制调度清单 */
  userText?: string;
  /** 短期+长期记忆上下文块（MEM-01/02）；拼入 Supervisor system prompt */
  memoryContextBlock?: string;
};

export type AgentRunConfig = {
  recursionLimit: number;
  configurable: { thread_id: string };
};

const DEFAULT_RECURSION_LIMIT = 40;

/** 进程级 MemorySaver，保证同进程 thread_id 跨请求可续聊 */
let memorySaverSingleton: MemorySaver | null = null;
/** 进程级 SqliteSaver（若启用） */
let sqliteSaverSingleton: BaseCheckpointSaver | null = null;

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
  const recursionLimit = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_RECURSION_LIMIT;
  return {
    recursionLimit,
    configurable: { thread_id: threadId.trim() },
  };
}

async function resolveCheckpointer(override?: BaseCheckpointSaver): Promise<BaseCheckpointSaver> {
  if (override) {
    return override;
  }
  const mode = (process.env.AGENT_CHECKPOINTER ?? "memory").toLowerCase();
  if (mode === "sqlite") {
    if (sqliteSaverSingleton) {
      return sqliteSaverSingleton;
    }
    const { mkdirSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    const dbPath =
      process.env.AGENT_CHECKPOINTER_SQLITE_PATH?.trim() ||
      resolve(process.cwd(), ".data/agent-checkpoints.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true });
    // SqliteSaver 与当前 BaseCheckpointSaver 泛型略有漂移；运行时可用
    sqliteSaverSingleton = SqliteSaver.fromConnString(dbPath) as unknown as BaseCheckpointSaver;
    return sqliteSaverSingleton;
  }
  if (!memorySaverSingleton) {
    memorySaverSingleton = new MemorySaver();
  }
  return memorySaverSingleton;
}

function routerNode(state: AgentStateType) {
  const text = lastUserText(state.messages);
  return { route: resolveAgentRoute(text) };
}

function shortReplyNode(state: AgentStateType) {
  const text = lastUserText(state.messages);
  return { messages: buildShortReplyMessages(text) };
}

type SpecialistBundle = {
  retriever: ReturnType<typeof createRetrieverAgent>;
  researcher: ReturnType<typeof createResearcherAgent>;
  analyst: ReturnType<typeof createAnalystAgent>;
  editor: ReturnType<typeof createEditorAgent>;
};

/** 创建四专科 Agent（Supervisor / Sequential 共用） */
function createSpecialistAgents(model: LanguageModelLike): SpecialistBundle {
  const skills = loadEnabledSkills();
  return {
    retriever: createRetrieverAgent(model, {
      skillPrompt: formatSkillForPrompt(findSkill(skills, "kb-retrieval")),
    }),
    researcher: createResearcherAgent(model, {
      skillPrompt: formatSkillForPrompt(findSkill(skills, "web-research")),
    }),
    analyst: createAnalystAgent(model),
    editor: createEditorAgent(model, {
      skillPrompt: formatSkillForPrompt(findSkill(skills, "report-writer")),
    }),
  };
}

/** 多步清单 ≥2 时走确定性流水线（对齐 LangGraph 显式边 / CrewAI sequential） */
export function shouldUseSequentialPipeline(required: SpecialistName[]): boolean {
  return required.length >= 2;
}

/** 多专科流水线保证以 editor 收束 */
export function ensureTerminalEditor(pipeline: SpecialistName[]): SpecialistName[] {
  if (pipeline.length === 0) return pipeline;
  const ordered = [...pipeline];
  if (ordered.length >= 2 && ordered[ordered.length - 1] !== "editor") {
    if (!ordered.includes("editor")) ordered.push("editor");
    else {
      const without = ordered.filter((n) => n !== "editor");
      ordered.splice(0, ordered.length, ...without, "editor");
    }
  }
  return ordered;
}

/**
 * 确定性 Sequential 子图：START → specialist₁ → … → editor → END。
 * 不依赖 Supervisor LLM handoff，从根上消灭「强制续跑」主路径。
 */
export function createSequentialPipelineWorkflow(
  model: LanguageModelLike,
  pipeline: SpecialistName[],
) {
  if (pipeline.length === 0) {
    throw new Error("sequential pipeline requires at least one specialist");
  }
  const ordered = ensureTerminalEditor(pipeline);
  const agents = createSpecialistAgents(model);
  // 动态节点名：用宽松 builder，避免 StateGraph 字面量联合类型卡住
  let g: any = new StateGraph(MessagesAnnotation);
  for (const name of ordered) {
    g = g.addNode(name, agents[name].graph);
  }
  g = g.addEdge(START, ordered[0]);
  for (let i = 0; i < ordered.length - 1; i++) {
    g = g.addEdge(ordered[i], ordered[i + 1]);
  }
  g = g.addEdge(ordered[ordered.length - 1], END);
  return g;
}

/** 共用：专科 + Supervisor workflow（未 compile） */
function createSupervisorWorkflow(
  model: LanguageModelLike,
  userText: string,
  memoryContextBlock?: string,
) {
  const skills = loadEnabledSkills();
  const agents = createSpecialistAgents(model);
  const basePrompt = buildSupervisorPrompt(formatSkillsOverview(skills), userText);
  const prompt = memoryContextBlock?.trim()
    ? `${basePrompt}\n\n${memoryContextBlock.trim()}`
    : basePrompt;

  return createSupervisor({
    agents: [
      agents.retriever.graph,
      agents.researcher.graph,
      agents.analyst.graph,
      agents.editor.graph,
    ],
    llm: model,
    prompt,
  });
}

/**
 * 编译外层短路图 + 内层 Supervisor。默认进程单例 MemorySaver。
 */
export async function buildAgentGraph(options: BuildAgentGraphOptions = {}) {
  const model = options.model ?? createChatModel();
  const checkpointer = await resolveCheckpointer(options.checkpointer);
  const userText = options.userText ?? "";
  const memoryContextBlock = options.memoryContextBlock;
  const required = inferRequiredSpecialists(userText);
  const collab = shouldUseSequentialPipeline(required)
    ? createSequentialPipelineWorkflow(model, required)
    : createSupervisorWorkflow(model, userText, memoryContextBlock);
  const supervisorSubgraph = collab.compile({ checkpointer });

  return new StateGraph(AgentState)
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
}

/**
 * 构建可 stream 的协作子图（绕过外层嵌套，便于 toUIMessageStream）。
 * - 多步强制清单 → Sequential 确定性边（LangGraph multi-agent 显式工作流）
 * - 否则 → createSupervisor hub-and-spoke
 */
export async function buildSupervisorGraph(options: BuildAgentGraphOptions = {}) {
  const model = options.model ?? createChatModel();
  const checkpointer = await resolveCheckpointer(options.checkpointer);
  const userText = options.userText ?? "";
  const memoryContextBlock = options.memoryContextBlock;
  const required = inferRequiredSpecialists(userText);
  if (shouldUseSequentialPipeline(required)) {
    return createSequentialPipelineWorkflow(model, required).compile({ checkpointer });
  }
  return createSupervisorWorkflow(model, userText, memoryContextBlock).compile({
    checkpointer,
  });
}

/** @deprecated 使用 buildAgentGraph；保留别名避免旧 smoke 误导 */
export const buildGraph = buildAgentGraph;
