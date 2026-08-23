/**
 * AGENT-01 图内核：外层闲聊短路 StateGraph + 内层 createSupervisor hub-and-spoke。
 *
 * 禁止：继续 fetch WEB_URL/api/chat（D-00b）；禁止引入 deepagents。
 *
 * GraphRecursionError（D-15）：invoke/stream 层捕获后应返回已产生的部分 messages /
 * 可读降级文案；完整流式接线在 02-04。本模块提供 getAgentRunConfig 注入 recursionLimit。
 */

import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import {
  isPlanAmbiguous,
  readIntentRouterConfig,
  type IntentPlan,
} from "@personal-gpt/shared/routing";

import { isRetrieverSynthesisPlan } from "../agent/agent-synthesis";
import { createAnalystAgent } from "../agents/analyst.agent";
import { createEditorAgent } from "../agents/editor.agent";
import { createResearcherAgent } from "../agents/researcher.agent";
import { createRetrieverAgent } from "../agents/retriever.agent";
import { createSynthesizerAgent } from "../agents/synthesizer.agent";
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
import { extractKbSearchQuery } from "../tools/extract-kb-query";
import { invokeGraphSearch } from "../tools/graph-search.tool";
import { invokeKbSearch } from "../tools/kb-search.tool";
import { buildShortReplyMessages, isAgentChitchat } from "./short-circuit";
import { AgentState, type AgentStateType } from "./state";

export type AgentRoute = "short" | "supervisor";

/** D-04: plan-driven execution modes */
export type ExecutionMode = "short" | "sequential" | "single_specialist" | "supervisor";

/** D-11: prefetch node id — tested for single_specialist wiring */
export const SINGLE_SPECIALIST_PREFETCH_NODE = "prefetch";

/** rag_generate 成文节点（single_specialist kb/graph 路径） */
export const SINGLE_SPECIALIST_SYNTHESIZE_NODE = "synthesizer";

export { isRetrieverSynthesisPlan };

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

/** 进程级 MemorySaver（AGENT_CHECKPOINTER=memory 或无 DATABASE_URL 降级） */
let memorySaverSingleton: MemorySaver | null = null;
/** 进程级 SqliteSaver（若启用） */
let sqliteSaverSingleton: BaseCheckpointSaver | null = null;
/** 进程级 PostgresSaver（D-20/D-21 默认） */
let postgresSaverSingleton: BaseCheckpointSaver | null = null;
/** PostgresSaver.setup() 是否已在 bootstrap 完成（Pitfall 5） */
let postgresSetupDone = false;
let postgresSetupPromise: Promise<void> | null = null;

type PostgresSaverInstance = BaseCheckpointSaver & { setup: () => Promise<void> };

function checkpointerMode(): string {
  return (process.env.AGENT_CHECKPOINTER ?? "postgres").toLowerCase();
}

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
 * D-04/D-16: IntentPlan → execution mode.
 * chitchat → short; ambiguous → supervisor; ≥2 specialists → sequential; 1 → single_specialist.
 */
export function resolveExecutionMode(plan: IntentPlan): ExecutionMode {
  if (plan.primary === "chitchat") return "short";
  if (isPlanAmbiguous(plan)) return "supervisor";
  if (plan.specialists.length >= 2) return "sequential";
  if (plan.specialists.length === 1) return "single_specialist";
  return "supervisor";
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

function getMemorySaver(): MemorySaver {
  if (!memorySaverSingleton) {
    memorySaverSingleton = new MemorySaver();
  }
  return memorySaverSingleton;
}

async function createPostgresSaver(): Promise<PostgresSaverInstance> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL required when AGENT_CHECKPOINTER=postgres");
  }
  const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
  const saver = PostgresSaver.fromConnString(url, {
    schema: process.env.AGENT_CHECKPOINT_SCHEMA?.trim() || "public",
  });
  return saver as unknown as PostgresSaverInstance;
}

/**
 * 解析 checkpointer：默认 postgres（D-21）；memory|sqlite 显式可选。
 * 无 DATABASE_URL 且未显式设 postgres 时降级 MemorySaver（测试/本地无 PG）。
 */
export async function resolveCheckpointer(
  override?: BaseCheckpointSaver,
): Promise<BaseCheckpointSaver> {
  if (override) {
    return override;
  }
  const mode = checkpointerMode();
  if (mode === "memory") {
    return getMemorySaver();
  }
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
  // postgres（默认）或未知值按 postgres 处理
  if (postgresSaverSingleton) {
    return postgresSaverSingleton;
  }
  const url = process.env.DATABASE_URL?.trim();
  const explicitPostgres = (process.env.AGENT_CHECKPOINTER ?? "").toLowerCase() === "postgres";
  if (!url) {
    if (explicitPostgres) {
      throw new Error("DATABASE_URL required when AGENT_CHECKPOINTER=postgres");
    }
    // D-21：默认 postgres 但无 PG → 降级 memory（单测 / 无库环境）
    return getMemorySaver();
  }
  postgresSaverSingleton = await createPostgresSaver();
  return postgresSaverSingleton;
}

/**
 * Nest bootstrap 调用一次：PostgresSaver.setup()（Pitfall 5）。
 * memory/sqlite 或无 DATABASE_URL 时 no-op。
 */
export async function ensureCheckpointerSetup(): Promise<void> {
  const mode = checkpointerMode();
  if (mode === "memory" || mode === "sqlite") {
    return;
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return;
  }
  if (postgresSetupDone) {
    return;
  }
  if (postgresSetupPromise) {
    await postgresSetupPromise;
    return;
  }
  postgresSetupPromise = (async () => {
    const saver = (await resolveCheckpointer()) as PostgresSaverInstance;
    if (typeof saver.setup === "function") {
      await saver.setup();
    }
    postgresSetupDone = true;
  })();
  try {
    await postgresSetupPromise;
  } finally {
    postgresSetupPromise = null;
  }
}

/** 测试用：重置进程级 checkpointer 单例 */
export function resetCheckpointerSingletonsForTests(): void {
  memorySaverSingleton = null;
  sqliteSaverSingleton = null;
  postgresSaverSingleton = null;
  postgresSetupDone = false;
  postgresSetupPromise = null;
}

/** 测试用：注入假 PostgresSaver（含 setup）以断言 bootstrap 契约 */
export function plantPostgresSaverForTests(
  saver: BaseCheckpointSaver & { setup: () => Promise<void> },
): void {
  postgresSaverSingleton = saver;
  postgresSetupDone = false;
  postgresSetupPromise = null;
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

/** 创建四专科 Agent（Supervisor / Sequential / single_specialist 共用） */
function createSpecialistAgents(
  model: LanguageModelLike,
  retrieverTools?: string[],
): SpecialistBundle {
  const skills = loadEnabledSkills();
  const retrieverAllowed =
    retrieverTools && retrieverTools.length > 0
      ? retrieverTools
      : (["kb_search", "graph_search"] as string[]);
  return {
    retriever: createRetrieverAgent(model, {
      skillPrompt: formatSkillForPrompt(findSkill(skills, "kb-retrieval")),
      allowedTools: retrieverAllowed,
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
  retrieverTools?: string[],
) {
  if (pipeline.length === 0) {
    throw new Error("sequential pipeline requires at least one specialist");
  }
  const ordered = ensureTerminalEditor(pipeline);
  const agents = createSpecialistAgents(model, retrieverTools);
  // 动态节点名：用宽松 builder；AgentState 含 todos/citations（D-22）
  let g: any = new StateGraph(AgentState);
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
  retrieverTools?: string[],
) {
  const skills = loadEnabledSkills();
  const agents = createSpecialistAgents(model, retrieverTools);
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
    // D-22：与外层一致，checkpoint 含 messages + todos + citations
    stateSchema: AgentState,
  });
}

/** D-11: server-side prefetch before synthesizer / Retriever in single_specialist path */
function buildPrefetchNode(plan: IntentPlan) {
  return async (
    state: AgentStateType,
    config?: { configurable?: Record<string, unknown> },
  ): Promise<{ messages: BaseMessage[] } | Record<string, never>> => {
    const text = lastUserText(state.messages);
    const workspaceId = String(config?.configurable?.workspaceId ?? "default");
    const { enableKbGraphFallback } = readIntentRouterConfig();
    const blocks: string[] = [];
    const graphOnly =
      plan.retrieverTools.includes("graph_search") && !plan.retrieverTools.includes("kb_search");

    const allowGraphFallback =
      enableKbGraphFallback &&
      (plan.fallbackChain.includes("graph_search") || plan.graphSignal === true);

    if (graphOnly) {
      const graphOut = await invokeGraphSearch({ question: text });
      if (/GRAPH_SEARCH_STATUS:\s*HIT/i.test(graphOut)) {
        blocks.push(`【图谱预检索·工具结果·可信】\n${graphOut}`);
      } else if (plan.fallbackChain.includes("kb_search")) {
        const kbOut = await invokeKbSearch({
          query: extractKbSearchQuery(text),
          userText: text,
          workspaceId,
        });
        blocks.push(`【图谱预检索·工具结果·可信】\n${graphOut}`);
        if (kbOut && !/KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(kbOut)) {
          blocks.push(`【知识库回退检索·工具结果·可信】\n${kbOut}`);
        }
      } else {
        blocks.push(`【图谱预检索·工具结果·可信】\n${graphOut}`);
      }
    } else if (plan.retrieverTools.includes("kb_search")) {
      let graphInjected = false;
      let graphOutCache: string | undefined;
      const kbOut = await invokeKbSearch({
        query: extractKbSearchQuery(text),
        userText: text,
        workspaceId,
      });
      if (kbOut) {
        const kbMiss = /KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(kbOut);
        if (kbMiss && allowGraphFallback) {
          graphOutCache = await invokeGraphSearch({ question: text });
          if (/GRAPH_SEARCH_STATUS:\s*HIT/i.test(graphOutCache)) {
            blocks.push(
              `【图谱回退检索·工具结果·可信】\nKB 未命中后按 fallbackChain 触发 graph_search；必须采信。\n${graphOutCache}`,
            );
            graphInjected = true;
          } else {
            blocks.push(`【知识库预检索·工具结果·可信】\n${kbOut}`);
          }
        } else {
          blocks.push(`【知识库预检索·工具结果·可信】\n${kbOut}`);
        }
      }
      if (
        plan.primary === "kb_graph_hybrid" &&
        plan.retrieverTools.includes("graph_search") &&
        !graphInjected
      ) {
        const graphOut = graphOutCache ?? (await invokeGraphSearch({ question: text }));
        blocks.push(`【图谱预检索·工具结果·可信】\n${graphOut}`);
      }
    }

    if (blocks.length === 0) return {};
    return {
      messages: [
        new SystemMessage(
          [
            "以下由服务端在成文层运行前直接调用工具得到；Synthesizer 必须采信，禁止编造相反结论。",
            ...blocks,
          ].join("\n\n"),
        ),
      ],
    };
  };
}

/**
 * D-11: single specialist — START → prefetch (optional) → synthesizer|specialist → END.
 * kb/graph retriever 路径：prefetch → Synthesizer（rag_generate）；其余专科保持原样。
 */
export function createSingleSpecialistWorkflow(
  model: LanguageModelLike,
  plan: IntentPlan,
  specialistName: SpecialistName,
) {
  const agents = createSpecialistAgents(model, plan.retrieverTools);
  const specialist = agents[specialistName];
  if (!specialist) {
    throw new Error(`createSingleSpecialistWorkflow: unknown specialist ${specialistName}`);
  }

  const useSynthesis = specialistName === "retriever" && isRetrieverSynthesisPlan(plan);
  const terminalNode = useSynthesis ? SINGLE_SPECIALIST_SYNTHESIZE_NODE : specialistName;
  const needsPrefetch = specialistName === "retriever" && plan.retrieverTools.length > 0;

  let g: any = new StateGraph(AgentState);
  if (useSynthesis) {
    g = g.addNode(SINGLE_SPECIALIST_SYNTHESIZE_NODE, createSynthesizerAgent(model, plan).graph);
  } else {
    g = g.addNode(specialistName, specialist.graph);
  }

  if (needsPrefetch) {
    g = g
      .addNode(SINGLE_SPECIALIST_PREFETCH_NODE, buildPrefetchNode(plan))
      .addEdge(START, SINGLE_SPECIALIST_PREFETCH_NODE)
      .addEdge(SINGLE_SPECIALIST_PREFETCH_NODE, terminalNode);
  } else {
    g = g.addEdge(START, terminalNode);
  }
  g = g.addEdge(terminalNode, END);
  return g;
}

export type BuildExecutionGraphOptions = BuildAgentGraphOptions & {
  plan: IntentPlan;
};

/**
 * D-04: plan-driven subgraph selection — replaces unconditional buildSupervisorGraph when router on.
 */
export async function buildExecutionGraph(options: BuildExecutionGraphOptions) {
  const model = options.model ?? createChatModel();
  const checkpointer = await resolveCheckpointer(options.checkpointer);
  const userText = options.userText ?? "";
  const memoryContextBlock = options.memoryContextBlock;
  const mode = resolveExecutionMode(options.plan);

  let inner: ReturnType<typeof createSequentialPipelineWorkflow>;
  if (mode === "sequential") {
    inner = createSequentialPipelineWorkflow(
      model,
      options.plan.specialists as SpecialistName[],
      options.plan.retrieverTools,
    );
  } else if (mode === "single_specialist") {
    inner = createSingleSpecialistWorkflow(
      model,
      options.plan,
      options.plan.specialists[0] as SpecialistName,
    );
  } else {
    inner = createSupervisorWorkflow(
      model,
      userText,
      memoryContextBlock,
      options.plan.retrieverTools,
    );
  }

  return inner.compile({ checkpointer });
}

/**
 * 编译外层短路图 + 内层 Supervisor。默认 PostgresSaver（D-21）；可注入 override。
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
