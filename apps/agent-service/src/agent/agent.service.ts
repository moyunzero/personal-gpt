/**
 * AGENT-04：LangGraph → UIMessage SSE（@ai-sdk/langchain@2.x）。
 * 替换 Phase 1 对 web /api/chat 的透传（D-00b）。
 */

import { Injectable } from "@nestjs/common";
import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import type { UIMessage } from "ai";
import { createUIMessageStream, pipeUIMessageStreamToResponse } from "ai";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Citation } from "@personal-gpt/shared";
import { loadMemoryContextBlock, persistTurnMemory } from "@personal-gpt/shared";
import { z } from "zod";

import {
  buildExecutionGraph,
  buildSupervisorGraph,
  getAgentRunConfig,
  lastUserText,
  resolveAgentRoute,
  resolveExecutionMode,
  shouldUseSequentialPipeline,
  type ExecutionMode,
} from "../graph/build-graph";
import { buildShortReplyMessages } from "../graph/short-circuit";
import { resolveKbMinSimilarity, resolveWorkspaceId } from "../rag/retrieve";
import {
  buildForceContinueNudge,
  isHandoffNoiseText,
  MAX_FORCE_CONTINUE_ROUNDS,
  missingRequiredSpecialists,
  nextRequiredSpecialist,
} from "../agents/pipeline-enforce";
import { inferRequiredSpecialists, type SpecialistName } from "../agents/supervisor.prompt";
import { ensureAgentLangSmithEnv } from "../observability/langsmith";
import {
  createAgentTraceCollector,
  summarizeGraphToolOutput,
  summarizeKbToolOutput,
  type AgentTraceCollector,
} from "../observability/agent-trace";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  clearKbSearchContextForThread,
  setKbSearchContextForThread,
} from "../tools/kb-search-context";
import { extractKbSearchQuery } from "../tools/extract-kb-query";
import { invokeKbSearch } from "../tools/kb-search.tool";
import { invokeGraphSearch } from "../tools/graph-search.tool";
import { resolveIntentPlanForAgent } from "../routing/intent-plan";
import { readIntentRouterConfig } from "@personal-gpt/shared/routing";
import type { IntentPlan, RouterLayer } from "@personal-gpt/shared/routing";
import type { AgentExecutionRoute } from "@personal-gpt/shared";
import {
  clearWebSearchCallCount,
  formatWebReferencesMarkdown,
  parseWebSearchSources,
  resetWebSearchCallCount,
  type WebSearchSource,
} from "../tools/web-search.tool";
import { sanitizeUserFacingAgentText } from "./sanitize-user-text";

/**
 * 从 kb_search 工具返回文本解析真实 Citation（禁止依赖模型在正文里自造 DOC-*）。
 */
export function parseKbCitationsFromToolText(text: string): Citation[] {
  if (!text.includes("[citation") || !text.includes("documentId:")) return [];
  const minSim = resolveKbMinSimilarity();
  const blocks = text.split(/\[citation\s+\d+\]/i).slice(1);
  const out: Citation[] = [];
  for (const block of blocks) {
    const title = block.match(/title:\s*(.+)/i)?.[1]?.trim();
    const source = block.match(/source:\s*(.+)/i)?.[1]?.trim();
    const documentId = block.match(/documentId:\s*(.+)/i)?.[1]?.trim();
    const snippet = block.match(/snippet:\s*([\s\S]*?)(?=\n\s*\n|$)/i)?.[1]?.trim();
    const simRaw = block.match(/similarity:\s*([0-9.]+)/i)?.[1];
    const chunkRaw = block.match(/chunkIndex:\s*(\d+)/i)?.[1];
    if (!documentId || documentId === "unknown" || !title) continue;
    const similarity = simRaw ? Number(simRaw) : 0;
    if (!Number.isFinite(similarity) || similarity < minSim) continue;
    out.push({
      documentId,
      title,
      source,
      snippet: snippet ?? "",
      similarity,
      chunkIndex: chunkRaw ? Number(chunkRaw) : undefined,
    });
  }
  return out;
}

function collectCitationsFromUpdate(
  update: Record<string, unknown>,
  bag: Map<string, Citation>,
  tracker?: { kbNoRelevantHit: boolean },
  trace?: AgentTraceCollector,
  webSources?: Map<string, WebSearchSource>,
): void {
  for (const [nodeName, nodeVal] of Object.entries(update)) {
    if (!nodeVal || typeof nodeVal !== "object") continue;
    const messages = (nodeVal as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    for (const msg of messages) {
      const content =
        typeof (msg as { content?: unknown })?.content === "string"
          ? (msg as { content: string }).content
          : typeof (msg as { kwargs?: { content?: unknown } })?.kwargs?.content === "string"
            ? (msg as { kwargs: { content: string } }).kwargs.content
            : "";
      if (!content) continue;
      if (tracker && /KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(content)) {
        tracker.kbNoRelevantHit = true;
      }
      if (trace) {
        // 仅认「工具原文」形态，避免专科复述被当成重复 tool 事件
        const trimmed = content.trim();
        if (/^KB_SEARCH_STATUS:/i.test(trimmed) || trimmed.includes("[citation")) {
          trace.recordTool({
            name: "kb_search",
            agent: nodeName,
            summary: summarizeKbToolOutput(content),
            detail: content,
          });
        } else if (/GRAPH_SEARCH_STATUS:/i.test(trimmed)) {
          trace.recordTool({
            name: "graph_search",
            agent: nodeName,
            summary: summarizeGraphToolOutput(content),
            detail: content,
          });
        } else if (/^引用:\s*\d+/m.test(trimmed) && /URL:\s*https?:\/\//i.test(trimmed)) {
          const sources = parseWebSearchSources(content);
          for (const s of sources) {
            webSources?.set(s.url, s);
          }
          trace.recordTool({
            name: "web_search",
            agent: nodeName,
            summary: sources.length
              ? `联网 ${sources.length} 条 · ${sources[0]!.title || sources[0]!.url}`
              : `联网结果摘要 ${Math.min(content.length, 2000)} 字`,
            detail: content,
          });
        } else if (
          !isHandoffNoiseText(content) &&
          content.length > 80 &&
          /retriever|researcher|analyst|editor/i.test(nodeName)
        ) {
          trace.recordIntermediate(nodeName, content);
        }
      }
      for (const c of parseKbCitationsFromToolText(content)) {
        const key = `${c.documentId}:${c.chunkIndex ?? 0}`;
        bag.set(key, c);
      }
    }
  }
}
/**
 * 客户端断开（res close/error）时 abort，供 LangGraph stream 取消。
 * Express Response 继承 EventEmitter；测试 mock 无事件时仍返回可用 AbortSignal。
 */
export function attachResponseAbortSignal(res: Response): AbortSignal {
  const ac = new AbortController();
  const abort = () => {
    if (!ac.signal.aborted) ac.abort();
  };
  const ee = res as unknown as EventEmitter;
  if (typeof ee?.once === "function") {
    ee.once("close", abort);
    ee.once("error", abort);
  }
  return ac.signal;
}

/**
 * 合并流可能重复 enqueue 同一 text-delta 事件。
 * - 有 seq：按 id 单调序号去重；同 seq 丢弃，seq 前进则保留（含合法重复正文）
 * - 无 seq：连续相同 id+delta 视为合并伪影丢弃；不相邻的相同正文仍保留
 */
export function deduplicateTextDeltas(): TransformStream<any, any> {
  const lastSeqById = new Map<string, number>();
  let lastContentKey = "";
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; id?: string; delta?: string; seq?: number };
      if (obj?.type === "text-delta") {
        const id = obj.id ?? "_";
        if (typeof obj.seq === "number" && Number.isFinite(obj.seq)) {
          const prev = lastSeqById.get(id);
          if (prev !== undefined && obj.seq <= prev) return;
          lastSeqById.set(id, obj.seq);
          lastContentKey = "";
        } else {
          const key = `${id}:${obj.delta ?? ""}`;
          if (key === lastContentKey) return;
          lastContentKey = key;
        }
      } else {
        lastContentKey = "";
      }
      controller.enqueue(chunk);
    },
  });
}

/** 外层已手动 write start 时，丢弃 merge 流里的重复 start，避免两条助手气泡 */
function stripMergedStart(): TransformStream<any, any> {
  let skipNextStart = true;
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string };
      if (obj?.type === "start" && skipNextStart) {
        skipNextStart = false;
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/**
 * LangGraph supervisor handoff 常产出无配对 tool-input 的 tool-output，
 * 前端 processUIMessageStream 会抛 No tool invocation found。
 * 丢弃孤儿 tool 输出事件，保留正文。
 */
function dropOrphanToolOutputs(): TransformStream<any, any> {
  const started = new Set<string>();
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; toolCallId?: string };
      const type = obj?.type ?? "";
      const id = obj?.toolCallId;
      if (
        id &&
        (type === "tool-input-start" ||
          type === "tool-input-available" ||
          type === "tool-input-delta")
      ) {
        started.add(id);
      }
      if (
        id &&
        (type.startsWith("tool-output") ||
          type === "tool-result" ||
          type === "tool-input-error" ||
          type === "tool-output-error" ||
          type === "tool-output-available" ||
          type === "tool-output-denied")
      ) {
        if (!started.has(id)) return;
      }
      controller.enqueue(chunk);
    },
  });
}

export class ModelConfigError extends Error {
  readonly statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

export class InvalidAgentBodyError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidAgentBodyError";
  }
}

export type AgentChatBody = {
  messages?: unknown;
  thread_id?: unknown;
  workspaceId?: unknown;
  userKey?: unknown;
};

export type ParsedAgentChat = {
  messages: UIMessage[];
  threadId: string;
  workspaceId: string;
  userKey: string;
};

const AgentUiMessageSchema = z
  .object({
    role: z.string().min(1),
  })
  .passthrough();

const AgentChatBodySchema = z.object({
  messages: z.array(AgentUiMessageSchema),
  thread_id: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  userKey: z.string().optional().nullable(),
});

const SAFE_THREAD_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** 校验 POST /agent/chat body；非法抛 InvalidAgentBodyError（→ 400） */
export function parseAgentChatBody(body: unknown): ParsedAgentChat {
  const result = AgentChatBodySchema.safeParse(body ?? {});
  if (!result.success) {
    throw new InvalidAgentBodyError("Invalid body: messages must be an array of message objects");
  }

  const { messages, thread_id, workspaceId, userKey } = result.data;
  const trimmedThread = typeof thread_id === "string" ? thread_id.trim() : "";
  if (trimmedThread && !SAFE_THREAD_ID.test(trimmedThread)) {
    throw new InvalidAgentBodyError(
      "Invalid body: thread_id must be a safe id (letters, digits, _.:-; max 128)",
    );
  }
  const threadRaw = trimmedThread || randomUUID();
  const workspaceRaw =
    typeof workspaceId === "string" && workspaceId.trim() ? workspaceId.trim() : "default";
  const userKeyRaw =
    typeof userKey === "string" && userKey.trim() ? userKey.trim().slice(0, 128) : "anonymous";

  return {
    messages: messages as unknown as UIMessage[],
    threadId: threadRaw,
    workspaceId: resolveWorkspaceId(workspaceRaw),
    userKey: userKeyRaw,
  };
}

function assertModelConfigured(): void {
  const cerebras = process.env.CEREBRAS_API_KEY?.trim();
  const groq = process.env.GROQ_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (!cerebras && !groq && !openai) {
    throw new ModelConfigError(
      "聊天模型未配置：请设置 CEREBRAS_API_KEY、GROQ_API_KEY 或 OPENAI_API_KEY · 可重试或改回 Chat",
    );
  }
}

/** 建议 LangSmith project=personal-gpt-agent（D-18）；缺省时 fail-open 不阻断 */
function ensureLangSmithProjectHint(): void {
  ensureAgentLangSmithEnv();
  if (!process.env.LANGSMITH_PROJECT?.trim()) {
    process.env.LANGSMITH_PROJECT = "personal-gpt-agent";
  }
}

type TodoItem = {
  id: string;
  label: string;
  status: "pending" | "active" | "completed";
};

type AgentStepPayload = {
  id: string;
  agent: string;
  title: string;
  status: "pending" | "active" | "completed" | "error";
  summary?: string;
};

const SPECIALIST_META: Record<
  string,
  { stepId: string; agent: string; title: string; todoId: string; summary: string }
> = {
  retriever: {
    stepId: "step-retriever",
    agent: "Retriever",
    title: "检索知识库",
    todoId: "todo-retrieve",
    summary: "kb_search · workspace 过滤检索",
  },
  researcher: {
    stepId: "step-researcher",
    agent: "Researcher",
    title: "联网补充",
    todoId: "todo-research",
    summary: "web_search · 外部资料补充",
  },
  analyst: {
    stepId: "step-analyst",
    agent: "Analyst",
    title: "分析整理",
    todoId: "todo-analyze",
    summary: "结构化对比与要点提炼",
  },
  editor: {
    stepId: "step-editor",
    agent: "Editor",
    title: "撰写报告",
    todoId: "todo-report",
    summary: "整理 Markdown 报告与引用",
  },
};

function shouldGraphFallbackAfterKbMiss(plan: IntentPlan, enableFallback: boolean): boolean {
  if (!enableFallback) return false;
  return plan.fallbackChain.includes("graph_search") || plan.graphSignal === true;
}

async function prefetchForSingleSpecialist(input: {
  plan: IntentPlan;
  userText: string;
  workspaceId: string;
  trace: AgentTraceCollector;
}): Promise<SystemMessage[]> {
  const seeds: SystemMessage[] = [];
  if (input.plan.retrieverTools.includes("graph_search")) {
    const graphOut = await invokeGraphSearch({ question: input.userText });
    input.trace.recordTool({
      name: "graph_search",
      agent: "system",
      summary: summarizeGraphToolOutput(graphOut),
      detail: graphOut,
    });
    if (/GRAPH_SEARCH_STATUS:\s*HIT/i.test(graphOut)) {
      seeds.push(
        new SystemMessage(
          [
            "【图谱预检索·工具结果·可信】",
            "以下由服务端在 Retriever 运行前直接调用 graph_search 得到；必须采信。",
            graphOut,
          ].join("\n"),
        ),
      );
    }
  }
  if (input.plan.retrieverTools.includes("kb_search")) {
    const kbOut = await invokeKbSearch({
      query: extractKbSearchQuery(input.userText),
      userText: input.userText,
      workspaceId: input.workspaceId,
    });
    if (kbOut) {
      input.trace.recordTool({
        name: "kb_search",
        agent: "system",
        summary: `预检索 · ${summarizeKbToolOutput(kbOut)}`,
        detail: kbOut,
      });
      seeds.push(
        new SystemMessage(
          [
            "【知识库预检索·工具结果·可信】",
            "以下由服务端在 Retriever 运行前直接调用 kb_search 得到；必须采信。",
            kbOut,
          ].join("\n"),
        ),
      );
    }
  }
  return seeds;
}

function writeProgress(
  writer: { write: (chunk: any) => void },
  threadId: string,
  todos: TodoItem[],
  steps: AgentStepPayload[],
): void {
  // 始终写出 todos（含空数组），以便直答时清掉前端残留的调研待办
  writer.write({
    type: "data-todo-update",
    id: `todo-${threadId}`,
    data: { todos },
  });
  for (const step of steps) {
    writer.write({
      type: "data-agent-step",
      id: step.id,
      data: step,
    });
  }
}

/** 解析 LangGraph multi-mode 事件：["updates"|"messages"|"values", data] */
function parseLgModeEvent(event: unknown): { mode: string; data: unknown } | null {
  if (!Array.isArray(event) || event.length < 2) return null;
  if (event.length === 3) {
    return { mode: String(event[1]), data: event[2] };
  }
  return { mode: String(event[0]), data: event[1] };
}

/**
 * 拦截 updates（用于逐步进度），其余事件原样交给 toUIMessageStream。
 */
async function* forwardUiEvents(
  source: AsyncIterable<unknown>,
  onUpdates: (update: Record<string, unknown>) => void,
): AsyncGenerator<unknown> {
  for await (const event of source) {
    const parsed = parseLgModeEvent(event);
    if (parsed?.mode === "updates" && parsed.data && typeof parsed.data === "object") {
      onUpdates(parsed.data as Record<string, unknown>);
      continue;
    }
    yield event;
  }
}

type ProgressTracker = {
  todos: TodoItem[];
  stepsById: Map<string, AgentStepPayload>;
  activeSpecialist: string | null;
  /** 是否调度过任一专科 Agent */
  sawSpecialist: boolean;
  /** 已跑过的专科名（小写） */
  ranSpecialists: Set<string>;
  /** kb_search 明确无有效命中 */
  kbNoRelevantHit: boolean;
  /** 是否已标记「Supervisor 直答」避免重复写进度 */
  directAnswerMarked: boolean;
  sawError: boolean;
  onChange: () => void;
};

function createProgressTracker(
  initialTodos: TodoItem[],
  initialSteps: AgentStepPayload[],
  emit: () => void,
): ProgressTracker {
  const stepsById = new Map(initialSteps.map((s) => [s.id, { ...s }]));
  return {
    todos: initialTodos.map((t) => ({ ...t })),
    stepsById,
    activeSpecialist: null,
    sawSpecialist: false,
    ranSpecialists: new Set(),
    kbNoRelevantHit: false,
    directAnswerMarked: false,
    sawError: false,
    onChange: emit,
  };
}

function emitTracker(
  tracker: ProgressTracker,
  writer: { write: (chunk: any) => void },
  threadId: string,
): void {
  writeProgress(writer, threadId, tracker.todos, [...tracker.stepsById.values()]);
}

/** Supervisor 未分派专科、直接作答：收起调研待办，步骤文案改为直答 */
function markSupervisorDirectAnswer(tracker: ProgressTracker): void {
  if (tracker.directAnswerMarked || tracker.sawSpecialist) return;
  tracker.directAnswerMarked = true;
  tracker.todos = [];
  tracker.stepsById.set("step-supervisor", {
    id: "step-supervisor",
    agent: "Supervisor",
    title: "直接作答",
    status: "completed",
    summary: "未调度专科助手 · 由 Supervisor 直接回复",
  });
  tracker.onChange();
}

function applyNodeUpdate(
  tracker: ProgressTracker,
  nodeName: string,
  executionMode?: ExecutionMode,
): void {
  const key = nodeName.toLowerCase();

  if (key === "prefetch") {
    tracker.sawSpecialist = true;
    tracker.directAnswerMarked = false;
    tracker.stepsById.set("step-prefetch", {
      id: "step-prefetch",
      agent: "System",
      title: "预检索",
      status: "completed",
      summary: "服务端工具预取（D-11）",
    });
    tracker.onChange();
    return;
  }

  if (key === "supervisor") {
    const existing = tracker.stepsById.get("step-supervisor");
    if (tracker.directAnswerMarked) {
      tracker.stepsById.set("step-supervisor", {
        id: "step-supervisor",
        agent: "Supervisor",
        title: "直接作答",
        status: "active",
        summary: "未调度专科助手 · 由 Supervisor 直接回复",
      });
      tracker.onChange();
      return;
    }
    tracker.stepsById.set("step-supervisor", {
      id: "step-supervisor",
      agent: "Supervisor",
      title: "调度专科助手",
      status: "active",
      summary: existing?.summary ?? "按任务分派 Retriever / Researcher / Analyst / Editor",
    });
    // 专科返回后 supervisor 再调度：把上一个专科标完成
    if (tracker.activeSpecialist) {
      const prev = SPECIALIST_META[tracker.activeSpecialist];
      if (prev) {
        const prevStep = tracker.stepsById.get(prev.stepId);
        if (prevStep) {
          tracker.stepsById.set(prev.stepId, {
            ...prevStep,
            status: "completed",
          });
        }
        tracker.todos = tracker.todos.map((t) =>
          t.id === prev.todoId ? { ...t, status: "completed" } : t,
        );
      }
      tracker.activeSpecialist = null;
    }
    tracker.onChange();
    return;
  }

  const meta = SPECIALIST_META[key];
  if (!meta) return;

  tracker.sawSpecialist = true;
  tracker.directAnswerMarked = false;
  tracker.ranSpecialists.add(key);

  // 若曾误判为「直答」并清空了待办，恢复调研待办骨架
  if (tracker.todos.length === 0) {
    tracker.todos = [
      { id: "todo-retrieve", label: "检索知识库", status: "pending" },
      { id: "todo-research", label: "联网补充（如需）", status: "pending" },
      { id: "todo-analyze", label: "分析整理", status: "pending" },
      { id: "todo-report", label: "撰写报告", status: "pending" },
    ];
  }

  // 完成上一个专科
  if (tracker.activeSpecialist && tracker.activeSpecialist !== key) {
    const prev = SPECIALIST_META[tracker.activeSpecialist];
    if (prev) {
      const prevStep = tracker.stepsById.get(prev.stepId);
      if (prevStep) {
        tracker.stepsById.set(prev.stepId, { ...prevStep, status: "completed" });
      }
      tracker.todos = tracker.todos.map((t) =>
        t.id === prev.todoId ? { ...t, status: "completed" } : t,
      );
    }
  }

  // 无论之前是否误标「直答」，专科一旦出现就把 Supervisor 改回调度语义
  tracker.stepsById.set("step-supervisor", {
    id: "step-supervisor",
    agent: "Supervisor",
    title: "调度专科助手",
    status: "completed",
    summary: `已分派 ${meta.agent}`,
  });

  tracker.stepsById.set(meta.stepId, {
    id: meta.stepId,
    agent: meta.agent,
    title: meta.title,
    status: "active",
    summary: meta.summary,
  });
  tracker.todos = tracker.todos.map((t) => {
    if (t.id === meta.todoId) return { ...t, status: "active" };
    if (t.status === "active" && t.id !== meta.todoId) {
      return { ...t, status: "completed" };
    }
    return t;
  });
  tracker.activeSpecialist = key;
  tracker.onChange();
}

function finalizeProgress(tracker: ProgressTracker, executionMode?: ExecutionMode): void {
  if (executionMode === "single_specialist" || executionMode === "sequential") {
    for (const name of tracker.ranSpecialists) {
      const meta = SPECIALIST_META[name];
      if (!meta) continue;
      tracker.todos = tracker.todos.map((t) =>
        t.id === meta.todoId ? { ...t, status: "completed" as const } : t,
      );
      const step = tracker.stepsById.get(meta.stepId);
      if (step && step.status !== "completed") {
        tracker.stepsById.set(meta.stepId, { ...step, status: "completed" });
      }
    }
    tracker.todos = tracker.todos.map((t) =>
      t.status === "active" ? { ...t, status: "completed" as const } : t,
    );
    for (const [id, step] of tracker.stepsById) {
      if (step.status === "active") {
        tracker.stepsById.set(id, { ...step, status: "completed" });
      }
    }
    tracker.activeSpecialist = null;
    tracker.onChange();
    return;
  }

  if (!tracker.sawSpecialist) {
    markSupervisorDirectAnswer(tracker);
    const step = tracker.stepsById.get("step-supervisor");
    if (step && step.status !== "completed") {
      tracker.stepsById.set("step-supervisor", {
        ...step,
        status: "completed",
      });
      tracker.onChange();
    }
    return;
  }

  // 只收尾实际跑过的项；未触发的 todo 保持 pending，避免「假完成」
  for (const name of tracker.ranSpecialists) {
    const meta = SPECIALIST_META[name];
    if (!meta) continue;
    tracker.todos = tracker.todos.map((t) =>
      t.id === meta.todoId ? { ...t, status: "completed" as const } : t,
    );
    const step = tracker.stepsById.get(meta.stepId);
    if (step && step.status !== "completed") {
      tracker.stepsById.set(meta.stepId, { ...step, status: "completed" });
    }
  }
  tracker.todos = tracker.todos.map((t) =>
    t.status === "active" ? { ...t, status: "completed" as const } : t,
  );
  for (const [id, step] of tracker.stepsById) {
    if (step.status === "active") {
      tracker.stepsById.set(id, { ...step, status: "completed" });
    }
  }
  tracker.activeSpecialist = null;
  tracker.onChange();
}

function buildInitialProgress(
  route: AgentExecutionRoute,
  userText = "",
  plan?: IntentPlan,
): {
  todos: TodoItem[];
  steps: AgentStepPayload[];
} {
  if (route === "short") {
    return {
      todos: [],
      steps: [
        {
          id: "step-short-circuit",
          agent: "Router",
          title: "已短路",
          status: "completed",
          summary: "闲聊 / 过短输入，未进入多 Agent 协作",
        },
      ],
    };
  }

  if (route === "single_specialist" && plan?.specialists.length === 1) {
    const name = plan.specialists[0]!;
    const meta = SPECIALIST_META[name];
    const toolHint = plan.retrieverTools.includes("graph_search")
      ? "graph_search"
      : plan.retrieverTools.includes("kb_search")
        ? "kb_search"
        : "";
    return {
      todos: meta
        ? [{ id: meta.todoId, label: meta.title, status: "pending" as const }]
        : [],
      steps: [
        {
          id: "step-prefetch",
          agent: "System",
          title: toolHint === "graph_search" ? "图谱检索" : "知识库检索",
          status: "active",
          summary: `single_specialist · ${toolHint || name} 预检索 + LLM 复述`,
        },
        ...(meta
          ? [
              {
                id: meta.stepId,
                agent: meta.agent,
                title: meta.title,
                status: "pending" as const,
                summary: meta.summary,
              },
            ]
          : []),
      ],
    };
  }

  if (route === "sequential" && plan && plan.specialists.length >= 2) {
    const pipeline = plan.specialists;
    return {
      todos: pipeline.map((name: string) => {
        const meta = SPECIALIST_META[name]!;
        return {
          id: meta.todoId,
          label: meta.title,
          status: "pending" as const,
        };
      }),
      steps: [
        {
          id: "step-supervisor",
          agent: "System",
          title: "顺序流水线",
          status: "active",
          summary: `确定性边：${pipeline.join(" → ")}`,
        },
      ],
    };
  }

  const required = plan?.specialists ?? inferRequiredSpecialists(userText);
  const todos: TodoItem[] =
    required.length >= 2
      ? required.map((name: string) => {
          const meta = SPECIALIST_META[name]!;
          return {
            id: meta.todoId,
            label: meta.title,
            status: "pending" as const,
          };
        })
      : [
          { id: "todo-retrieve", label: "检索知识库", status: "pending" },
          { id: "todo-research", label: "联网补充（如需）", status: "pending" },
          { id: "todo-analyze", label: "分析整理", status: "pending" },
          { id: "todo-report", label: "撰写报告", status: "pending" },
        ];

  return {
    todos,
    steps: [
      {
        id: "step-supervisor",
        agent: "Supervisor",
        title: required.length >= 2 ? "顺序流水线" : "调度专科助手",
        status: "active",
        summary:
          required.length >= 2
            ? `确定性边：${required.join(" → ")}`
            : "按任务分派 Retriever / Researcher / Analyst / Editor",
      },
    ],
  };
}

/** Supervisor 交接话术，不是终稿 — 见 isHandoffNoiseText */

/** 按完整 text 段丢弃交接噪音，并消毒 KB 技术标记（验收：无 KB_SEARCH_STATUS 外泄） */
function dropHandoffNoiseText(): TransformStream<any, any> {
  let collecting = false;
  let buf: any[] = [];
  let text = "";
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; delta?: string; id?: string };
      const t = obj?.type;
      if (t === "text-start") {
        collecting = true;
        buf = [chunk];
        text = "";
        return;
      }
      if (collecting && t === "text-delta") {
        buf.push(chunk);
        text += obj.delta ?? "";
        return;
      }
      if (collecting && t === "text-end") {
        buf.push(chunk);
        collecting = false;
        if (!isHandoffNoiseText(text)) {
          const cleaned = sanitizeUserFacingAgentText(text);
          if (cleaned.trim()) {
            const start = buf[0] as { type?: string; id?: string };
            controller.enqueue(start);
            controller.enqueue({
              type: "text-delta",
              id: start?.id,
              delta: cleaned,
            });
            controller.enqueue(chunk);
          }
        }
        buf = [];
        text = "";
        return;
      }
      // 未配对的 text-end / text-delta：丢弃，避免 AI SDK 报 missing text-start
      if (!collecting && (t === "text-end" || t === "text-delta")) {
        return;
      }
      // 段未闭合就遇到非 text：按 text-end 同款消毒后关闭，后续配对 text-end 会被忽略
      if (collecting) {
        collecting = false;
        if (!isHandoffNoiseText(text)) {
          const cleaned = sanitizeUserFacingAgentText(text);
          if (cleaned.trim()) {
            const start = buf[0] as { type?: string; id?: string };
            controller.enqueue(start);
            controller.enqueue({
              type: "text-delta",
              id: start?.id,
              delta: cleaned,
            });
            controller.enqueue({ type: "text-end", id: start?.id });
          }
        }
        buf = [];
        text = "";
      }
      controller.enqueue(chunk);
    },
  });
}

/** 持有段是否像 Editor 终稿（有标题或足够长）；否则视为专科中间叙述可丢弃 */
function isReportLikeHeldText(chunks: any[]): boolean {
  const text = chunks
    .filter((c) => (c as { type?: string }).type === "text-delta")
    .map((c) => (c as { delta?: string }).delta ?? "")
    .join("");
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^#{1,6}\s/m.test(trimmed) || trimmed.length >= 400;
}

/**
 * 需要 Editor 终稿时，隐藏专科中间叙述。
 * Sequential 无 transfer_to_editor：锁定期间只保留「最后一段」完整 text；
 * 解锁时仅刷出报告样持有段，丢弃 Retriever 等中间 miss 叙述，避免与标题粘连。
 */
export function suppressIntermediateText(opts: {
  hideUntilEditor: boolean;
  /** 仅解锁 UI 正文，不得记入 ranSpecialists */
  textUnlocked: () => boolean;
  unlockText?: () => void;
}): TransformStream<any, any> {
  let pending: any[] = [];
  let lastComplete: any[] | null = null;
  let wasUnlocked = !opts.hideUntilEditor;

  const flushHeld = (
    controller: TransformStreamDefaultController<any>,
    optsFlush: { dropNonReport: boolean },
  ) => {
    if (lastComplete) {
      if (!optsFlush.dropNonReport || isReportLikeHeldText(lastComplete)) {
        for (const c of lastComplete) controller.enqueue(c);
      }
      lastComplete = null;
    }
    for (const c of pending) controller.enqueue(c);
    pending = [];
  };

  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; toolName?: string };
      if (
        opts.hideUntilEditor &&
        obj?.type === "tool-input-start" &&
        /transfer_to_editor/i.test(obj.toolName ?? "")
      ) {
        // Supervisor handoff：丢掉中间专科持有段，随后 Editor 正文直接透出
        pending = [];
        lastComplete = null;
        opts.unlockText?.();
      }

      const unlocked = !opts.hideUntilEditor || opts.textUnlocked();
      if (unlocked) {
        const firstUnlock = !wasUnlocked;
        wasUnlocked = true;
        // 首次解锁：丢弃非报告持有段（Retriever miss 等）；已解锁后正常刷 pending
        flushHeld(controller, { dropNonReport: firstUnlock });
        controller.enqueue(chunk);
        return;
      }

      wasUnlocked = false;
      const t = obj?.type;
      if (t === "text-start") {
        pending = [chunk];
        return;
      }
      if (t === "text-delta" && pending.length > 0) {
        pending.push(chunk);
        return;
      }
      if (t === "text-end" && pending.length > 0) {
        pending.push(chunk);
        // 覆盖式保留最后完整段（最终应为 Editor）
        lastComplete = pending;
        pending = [];
        return;
      }
      if (t === "text-start" || t === "text-delta" || t === "text-end") {
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      // gate 未开时仍发出最后完整段，避免整段终稿被丢弃
      flushHeld(controller, { dropNonReport: false });
    },
  });
}

@Injectable()
export class AgentService {
  /**
   * 将 UIMessage 流转写到 Express Response。
   * GraphRecursionError / 工具降级时尽量写出可读错误或部分文本（D-16）。
   */
  async streamChat(body: unknown, res: Response): Promise<void> {
    assertModelConfigured();
    ensureLangSmithProjectHint();

    const parsed = parseAgentChatBody(body);
    const lcMessages = await toBaseMessages(parsed.messages);
    const userText = lastUserText(lcMessages);
    const routerConfig = readIntentRouterConfig();
    let intentPlan: IntentPlan | undefined;
    let routerLayers: RouterLayer[] = [];
    let executionMode: ExecutionMode;

    if (routerConfig.enableIntentRouter) {
      const resolved = await resolveIntentPlanForAgent({
        query: userText,
        workspaceId: parsed.workspaceId,
      });
      intentPlan = resolved.plan;
      routerLayers = resolved.layers;
      executionMode = resolveExecutionMode(intentPlan);
    } else {
      executionMode = resolveAgentRoute(userText) === "short" ? "short" : "supervisor";
    }

    const executionRoute = executionMode as AgentExecutionRoute;
    const requiredEarly = intentPlan?.specialists ?? inferRequiredSpecialists(userText);
    const runConfig = getAgentRunConfig(parsed.threadId);
    const abortSignal = attachResponseAbortSignal(res);
    // 请求级 runId：避免同 thread 并发互相覆盖 KB/web 配额状态
    const runId = randomUUID();
    const memoryBlock = await loadMemoryContextBlock(
      { workspaceId: parsed.workspaceId, userKey: parsed.userKey },
      userText,
    );

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        setKbSearchContextForThread(runId, {
          userText,
          workspaceId: parsed.workspaceId,
        });
        resetWebSearchCallCount(runId);
        let assistantForMemory = "";
        try {
          const trace = createAgentTraceCollector({
            threadId: parsed.threadId,
            userText,
            intent: {
              route: executionRoute,
              requiredSpecialists: requiredEarly,
              plan: intentPlan,
              routerLayers: routerLayers.length ? routerLayers : undefined,
            },
            langsmithProject: process.env.LANGSMITH_PROJECT?.trim(),
          });
          const { todos, steps } = buildInitialProgress(executionRoute, userText, intentPlan);
          trace.recordPlan(
            todos.map((t) => ({
              id: t.id,
              label: t.label,
              status: t.status,
            })),
          );

          // start 必须在自定义 data-* 之前，否则 useChat 会拆成两条助手消息
          writer.write({ type: "start", messageId: `agent-${parsed.threadId}` });
          writeProgress(writer, parsed.threadId, todos, steps);

          const emitTrace = () => {
            const doc = trace.finish();
            const path = trace.persistIfEnabled();
            if (path) {
              doc.meta = { ...doc.meta, persisted: true };
            }
            writer.write({
              type: "data-agent-trace",
              id: `trace-${parsed.threadId}`,
              data: doc,
            });
          };

          try {
            if (executionMode === "short") {
              // 直接写出短路正文：外层图 AIMessage 经 toUIMessageStream 不会产生 text-delta
              const shortMsgs = buildShortReplyMessages(userText);
              let shortText = shortMsgs
                .map((m) => (typeof m.content === "string" ? m.content : ""))
                .filter(Boolean)
                .join("\n");
              if (memoryBlock && /喜欢|偏好|记住|习惯/.test(userText) && memoryBlock.includes("【长期记忆】")) {
                shortText = `${shortText}\n\n（根据你的长期偏好）\n${memoryBlock}`;
              }
              if (shortText) {
                const messageId = `short-${parsed.threadId}`;
                writer.write({ type: "text-start", id: messageId });
                writer.write({ type: "text-delta", id: messageId, delta: shortText });
                writer.write({ type: "text-end", id: messageId });
                assistantForMemory = shortText;
              }
              trace.recordSpecialist("System", "闲聊短路 · 未进入 Supervisor 多 Agent");
              emitTrace();
            } else {
              const required = requiredEarly as SpecialistName[];
              const hideUntilEditor =
                executionMode !== "single_specialist" && required.includes("editor");
              const executionGraph =
                routerConfig.enableIntentRouter && intentPlan
                  ? await buildExecutionGraph({
                      plan: intentPlan,
                      userText,
                      memoryContextBlock: memoryBlock || undefined,
                    })
                  : await buildSupervisorGraph({
                      userText,
                      memoryContextBlock: memoryBlock || undefined,
                    });
              const tracker = createProgressTracker(todos, steps, () => {
                emitTracker(tracker, writer, parsed.threadId);
              });
              const streamConfig = {
                streamMode: ["updates", "values", "messages"] as ["updates", "values", "messages"],
                recursionLimit: runConfig.recursionLimit,
                signal: abortSignal,
                configurable: {
                  ...runConfig.configurable,
                  run_id: runId,
                  workspaceId: parsed.workspaceId,
                  userText,
                },
              };
              const citationBag = new Map<string, Citation>();
              const webSources = new Map<string, WebSearchSource>();
              const textGate = { open: !hideUntilEditor };
              let visibleReportChars = 0;
              let finalBuf = "";
              const sequential =
                executionMode === "sequential" || shouldUseSequentialPipeline(required);
              if (sequential) {
                trace.recordSpecialist(
                  "System",
                  `确定性流水线 · ${required.join(" → ")}（无 Supervisor handoff）`,
                );
              } else if (executionMode === "single_specialist") {
                trace.recordSpecialist(
                  "System",
                  `single_specialist · ${intentPlan?.primary ?? "retriever"} · 预检索 + LLM 复述`,
                );
              }

              // 按需预检索：plan 驱动或 legacy 启发式
              const shouldPrefetchKb = intentPlan
                ? intentPlan.retrieverTools.includes("kb_search") ||
                  intentPlan.channels === "kb" ||
                  intentPlan.channels === "kb+graph"
                : required.includes("retriever") ||
                  /知识库|企业.?库|内部.?文档|\bkb\b|引用/.test(userText);
              const skipKbPrefetchForSingleGraph =
                executionMode === "single_specialist" &&
                intentPlan?.retrieverTools.includes("graph_search") &&
                !intentPlan?.retrieverTools.includes("kb_search");
              let seededMessages: Array<SystemMessage | (typeof lcMessages)[number]> = [
                ...lcMessages,
              ];
              if (memoryBlock) {
                seededMessages = [
                  new SystemMessage(
                    [
                      "【用户记忆·可信】",
                      "以下为短期/长期记忆，请结合回答，勿编造未出现的偏好。",
                      memoryBlock,
                    ].join("\n"),
                  ),
                  ...seededMessages,
                ];
              }
              if (shouldPrefetchKb && !skipKbPrefetchForSingleGraph) {
                const KB_PREFETCH_TIMEOUT_MS = 8_000;
                let timer: ReturnType<typeof setTimeout> | undefined;
                let onAbort: (() => void) | undefined;
                const kbPrefetch = await Promise.race([
                  invokeKbSearch({
                    // 长任务句先压缩检索词；invoke 内仍会用 userText / condensed 回退
                    query: extractKbSearchQuery(userText),
                    userText,
                    workspaceId: parsed.workspaceId,
                  }),
                  new Promise<undefined>((resolve) => {
                    timer = setTimeout(() => resolve(undefined), KB_PREFETCH_TIMEOUT_MS);
                    timer.unref?.();
                  }),
                  new Promise<undefined>((resolve) => {
                    if (abortSignal?.aborted) {
                      resolve(undefined);
                      return;
                    }
                    onAbort = () => resolve(undefined);
                    abortSignal?.addEventListener("abort", onAbort, { once: true });
                  }),
                ]).finally(() => {
                  if (timer) clearTimeout(timer);
                  if (onAbort) abortSignal?.removeEventListener("abort", onAbort);
                });
                if (abortSignal?.aborted) {
                  return;
                }
                if (kbPrefetch) {
                  trace.recordTool({
                    name: "kb_search",
                    agent: "system",
                    summary: `预检索 · ${summarizeKbToolOutput(kbPrefetch)}`,
                    detail: kbPrefetch,
                  });
                  for (const c of parseKbCitationsFromToolText(kbPrefetch)) {
                    citationBag.set(`${c.documentId}:${c.chunkIndex ?? 0}`, c);
                  }
                  if (/KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(kbPrefetch)) {
                    tracker.kbNoRelevantHit = true;
                    if (
                      intentPlan &&
                      shouldGraphFallbackAfterKbMiss(intentPlan, routerConfig.enableKbGraphFallback)
                    ) {
                      const graphOut = await invokeGraphSearch({ question: userText });
                      trace.recordTool({
                        name: "graph_search",
                        agent: "system",
                        summary: summarizeGraphToolOutput(graphOut),
                        detail: graphOut,
                      });
                      if (/GRAPH_SEARCH_STATUS:\s*HIT/i.test(graphOut)) {
                        seededMessages = [
                          new SystemMessage(
                            [
                              "【图谱回退检索·工具结果·可信】",
                              "KB 未命中后按 IntentPlan fallbackChain 触发 graph_search；必须采信。",
                              graphOut,
                            ].join("\n"),
                          ),
                          ...seededMessages,
                        ];
                      }
                    }
                  }
                  if (!/KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(kbPrefetch)) {
                    seededMessages = [
                      new SystemMessage(
                        [
                          "【知识库预检索·工具结果·可信】",
                          "以下由服务端直接调用 kb_search 得到；子 Agent 必须采信，禁止编造相反的命中/未命中结论。",
                          kbPrefetch,
                        ].join("\n"),
                      ),
                      ...seededMessages,
                    ];
                  }
                }
              }

              if (executionMode === "single_specialist" && intentPlan) {
                const prefetchSeeds = await prefetchForSingleSpecialist({
                  plan: intentPlan,
                  userText,
                  workspaceId: parsed.workspaceId,
                  trace,
                });
                if (prefetchSeeds.length) {
                  seededMessages = [...prefetchSeeds, ...seededMessages];
                }
              }

              if (abortSignal?.aborted) {
                return;
              }

              const drainGraphStream = async (input: { messages: unknown }): Promise<void> => {
                const lgStream = await executionGraph.stream(
                  input as { messages: typeof lcMessages },
                  streamConfig,
                );
                const uiSource = forwardUiEvents(lgStream, (update) => {
                  collectCitationsFromUpdate(update, citationBag, tracker, trace, webSources);
                  for (const nodeName of Object.keys(update)) {
                    const before = tracker.activeSpecialist;
                    applyNodeUpdate(tracker, nodeName, executionMode);
                    const key = nodeName.toLowerCase();
                    if (SPECIALIST_META[key] && tracker.activeSpecialist === key) {
                      const meta = SPECIALIST_META[key]!;
                      if (before !== key) {
                        trace.recordSpecialist(meta.agent, `${meta.title} · ${meta.summary}`);
                      }
                    }
                    // Sequential 无 transfer：editor 节点 updates 到达即解锁（持有段在 transform flush）
                    if (key === "editor") {
                      textGate.open = true;
                    }
                  }
                });
                const uiStream = toUIMessageStream(uiSource as any)
                  .pipeThrough(stripMergedStart())
                  .pipeThrough(dropOrphanToolOutputs())
                  .pipeThrough(deduplicateTextDeltas())
                  .pipeThrough(
                    suppressIntermediateText({
                      hideUntilEditor,
                      textUnlocked: () =>
                        textGate.open ||
                        tracker.activeSpecialist === "editor" ||
                        tracker.ranSpecialists.has("editor"),
                      unlockText: () => {
                        textGate.open = true;
                      },
                    }),
                  )
                  .pipeThrough(dropHandoffNoiseText());

                const reader = uiStream.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const obj = value as {
                      type?: string;
                      delta?: string;
                      toolName?: string;
                    };
                    if (obj?.type === "error") tracker.sawError = true;
                    if (
                      obj?.type === "tool-input-start" &&
                      obj.toolName &&
                      /transfer_to_/i.test(obj.toolName)
                    ) {
                      trace.recordTool({
                        name: obj.toolName,
                        summary: `handoff ${obj.toolName}`,
                        agent: tracker.activeSpecialist ?? "supervisor",
                      });
                    }
                    if (obj?.type === "text-delta" && obj.delta) {
                      visibleReportChars += obj.delta.length;
                      finalBuf += obj.delta;
                      trace.appendFinalText(obj.delta);
                    }
                    writer.write(value);
                  }
                } finally {
                  try {
                    await reader.cancel();
                  } catch {
                    /* ignore */
                  }
                  try {
                    reader.releaseLock();
                  } catch {
                    /* ignore */
                  }
                }
              };

              await drainGraphStream({ messages: seededMessages });

              // Supervisor 开放模式才需要 HumanMessage 强制续跑；Sequential / single_specialist 由边保证
              if (!sequential && executionMode !== "single_specialist") {
                let forceRound = 0;
                while (
                  !tracker.sawError &&
                  !abortSignal?.aborted &&
                  forceRound < MAX_FORCE_CONTINUE_ROUNDS
                ) {
                  const next = nextRequiredSpecialist(required, tracker.ranSpecialists);
                  const editorNeedsBody =
                    required.includes("editor") &&
                    tracker.ranSpecialists.has("editor") &&
                    visibleReportChars < 200;
                  if (!next && !editorNeedsBody) break;
                  const missing = missingRequiredSpecialists(required, tracker.ranSpecialists);
                  const target = next ?? "editor";
                  forceRound += 1;
                  trace.recordSpecialist("System", `强制续跑 #${forceRound} → ${target}`);
                  const kbMiss =
                    target === "editor" &&
                    (tracker.kbNoRelevantHit ||
                      (tracker.ranSpecialists.has("retriever") && citationBag.size === 0));
                  await drainGraphStream({
                    messages: [
                      new HumanMessage(
                        buildForceContinueNudge(target, missing.length ? missing : ["editor"], {
                          kbNoRelevantHit: kbMiss,
                        }) +
                          (editorNeedsBody
                            ? " 上轮未出现报告正文：禁止再输出「请等待」，必须立刻产出完整 Markdown 报告。"
                            : ""),
                      ),
                    ],
                  });
                }
              }

              if (tracker.ranSpecialists.has("retriever") && citationBag.size === 0) {
                tracker.kbNoRelevantHit = true;
              }

              if (!tracker.sawError) {
                if (
                  tracker.kbNoRelevantHit ||
                  (tracker.ranSpecialists.has("retriever") && citationBag.size === 0)
                ) {
                  const noteId = `kb-miss-${parsed.threadId}`;
                  const note =
                    visibleReportChars >= 200
                      ? "\n\n> 说明：知识库未找到足够依据；上文对比主要来自联网资料，未使用内部文档编号。\n"
                      : "\n\n> 说明：知识库未找到足够依据。若上方缺少完整报告，请重试一次。\n";
                  writer.write({ type: "text-start", id: noteId });
                  writer.write({
                    type: "text-delta",
                    id: noteId,
                    delta: note,
                  });
                  writer.write({ type: "text-end", id: noteId });
                  finalBuf += note;
                  trace.appendFinalText(note);
                }
                // 终稿若缺可点 URL，用工具返回的真实来源兜底（对齐 RAGFlow/官方工具引用可解释性）
                const refMd = formatWebReferencesMarkdown([...webSources.values()]);
                if (refMd && !/https?:\/\/\S+/i.test(finalBuf)) {
                  const refId = `web-ref-${parsed.threadId}`;
                  writer.write({ type: "text-start", id: refId });
                  writer.write({ type: "text-delta", id: refId, delta: refMd });
                  writer.write({ type: "text-end", id: refId });
                  finalBuf += refMd;
                  trace.appendFinalText(refMd);
                }
                finalizeProgress(tracker, executionMode);
                trace.recordPlan(
                  tracker.todos.map((t) => ({
                    id: t.id,
                    label: t.label,
                    status: t.status,
                  })),
                );
                const citations = [...citationBag.values()];
                // D-22：checkpoint 为真相源；SSE data-* 仅投影
                try {
                  await executionGraph.updateState(
                    {
                      configurable: {
                        ...runConfig.configurable,
                        run_id: runId,
                        workspaceId: parsed.workspaceId,
                      },
                    },
                    {
                      todos: tracker.todos.map((t) => ({ ...t })),
                      citations: citations.map((c) => ({ ...c })),
                      workspaceId: parsed.workspaceId,
                    },
                  );
                } catch (persistErr) {
                  console.warn("[agent] checkpoint todos/citations persist failed", persistErr);
                }
                if (citations.length > 0) {
                  writer.write({
                    type: "data-citations",
                    id: `citations-${parsed.threadId}`,
                    data: { citations },
                  });
                }
                trace.setCitations(
                  citations.map((c) => ({
                    documentId: c.documentId,
                    title: c.title,
                    similarity: c.similarity,
                    source: c.source,
                  })),
                );
                if (finalBuf.trim()) trace.setFinalText(finalBuf);
                assistantForMemory = finalBuf;
                emitTrace();
              } else {
                for (const [id, step] of tracker.stepsById) {
                  if (step.status === "active") {
                    tracker.stepsById.set(id, { ...step, status: "error" });
                  }
                }
                tracker.todos = tracker.todos.map((t) =>
                  t.status === "active" ? { ...t, status: "pending" } : t,
                );
                emitTracker(tracker, writer, parsed.threadId);
                trace.recordError("流式执行中出现 error 事件");
                emitTrace();
              }
            }
          } catch (err) {
            const correlationId = randomUUID();
            const name = err instanceof Error ? err.name : "";
            const msg = err instanceof Error ? err.message : String(err);
            const isRecursion = name === "GraphRecursionError" || /recursion/i.test(msg);
            console.error("[agent] execute failed", { correlationId, name, err: msg });
            const errorText = isRecursion
              ? `任务步数达到上限，已停止继续调度 · 可重试或改回 Chat（requestId: ${correlationId}）`
              : `Agent 执行失败 · 可重试或改回 Chat（requestId: ${correlationId}）`;

            const messageId = `err-${parsed.threadId}`;
            writer.write({ type: "text-start", id: messageId });
            writer.write({
              type: "text-delta",
              id: messageId,
              delta: errorText,
            });
            writer.write({ type: "text-end", id: messageId });
            writeProgress(
              writer,
              parsed.threadId,
              todos.map((t) => ({ ...t, status: "pending" as const })),
              [
                ...steps.map((s) => ({ ...s, status: "error" as const })),
                {
                  id: "step-error",
                  agent: "System",
                  title: "执行降级",
                  status: "error" as const,
                  summary: errorText,
                },
              ],
            );
            try {
              trace.recordError(errorText);
              emitTrace();
            } catch {
              /* ignore trace failures */
            }
          } finally {
            try {
              await persistTurnMemory(
                { workspaceId: parsed.workspaceId, userKey: parsed.userKey },
                userText,
                assistantForMemory,
              );
            } catch {
              /* fail-open */
            }
          }
        } finally {
          clearKbSearchContextForThread(runId);
          clearWebSearchCallCount(runId);
        }
      },
      onError: (error) => {
        const correlationId = randomUUID();
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[agent] stream onError", { correlationId, err: msg });
        return `Agent 执行失败 · 可重试或改回 Chat（requestId: ${correlationId}）`;
      },
    });

    await pipeUIMessageStreamToResponse({
      response: res,
      stream,
    });
  }
}
