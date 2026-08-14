/**
 * AGENT-04：LangGraph → UIMessage SSE（@ai-sdk/langchain@2.x）。
 * 替换 Phase 1 对 web /api/chat 的透传（D-00b）。
 */

import { Injectable } from "@nestjs/common";
import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import type { UIMessage } from "ai";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
} from "ai";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import type { Citation } from "@personal-gpt/shared";

import {
  buildAgentGraph,
  buildSupervisorGraph,
  getAgentRunConfig,
  lastUserText,
  resolveAgentRoute,
} from "../graph/build-graph";
import { resolveKbMinSimilarity, resolveWorkspaceId } from "../rag/retrieve";
import {
  buildForceContinueNudge,
  isHandoffNoiseText,
  MAX_FORCE_CONTINUE_ROUNDS,
  missingRequiredSpecialists,
  nextRequiredSpecialist,
} from "../agents/pipeline-enforce";
import { inferRequiredSpecialists } from "../agents/supervisor.prompt";
import { ensureAgentLangSmithEnv } from "../observability/langsmith";
import {
  createAgentTraceCollector,
  summarizeKbToolOutput,
  type AgentTraceCollector,
} from "../observability/agent-trace";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  clearKbSearchContextForThread,
  setKbSearchContextForThread,
} from "../tools/kb-search-context";
import { invokeKbSearch } from "../tools/kb-search.tool";

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
): void {
  for (const [nodeName, nodeVal] of Object.entries(update)) {
    if (!nodeVal || typeof nodeVal !== "object") continue;
    const messages = (nodeVal as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    for (const msg of messages) {
      const content =
        typeof (msg as { content?: unknown })?.content === "string"
          ? (msg as { content: string }).content
          : typeof (msg as { kwargs?: { content?: unknown } })?.kwargs
                ?.content === "string"
            ? ((msg as { kwargs: { content: string } }).kwargs.content)
            : "";
      if (!content) continue;
      if (
        tracker &&
        /KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(content)
      ) {
        tracker.kbNoRelevantHit = true;
      }
      if (trace) {
        if (/KB_SEARCH_STATUS:/i.test(content) || content.includes("[citation")) {
          trace.recordTool({
            name: "kb_search",
            agent: nodeName,
            summary: summarizeKbToolOutput(content),
            detail: content,
          });
        } else if (
          /web_search|bocha|http:\/\//i.test(content) &&
          content.length > 40
        ) {
          trace.recordTool({
            name: "web_search",
            agent: nodeName,
            summary: `联网结果摘要 ${Math.min(content.length, 2000)} 字`,
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
function deduplicateTextDeltas(): TransformStream<any, any> {
  let lastTextKey = "";
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; id?: string; delta?: string };
      if (obj?.type === "text-delta") {
        const key = `${obj.id}:${obj.delta}`;
        if (key === lastTextKey) return;
        lastTextKey = key;
      } else {
        lastTextKey = "";
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
};

export type ParsedAgentChat = {
  messages: UIMessage[];
  threadId: string;
  workspaceId: string;
};

/** 校验 POST /agent/chat body；非法抛 InvalidAgentBodyError（→ 400） */
export function parseAgentChatBody(body: AgentChatBody): ParsedAgentChat {
  if (!body || !Array.isArray(body.messages)) {
    throw new InvalidAgentBodyError("Invalid body: messages must be an array");
  }

  const messages = body.messages as UIMessage[];
  const threadRaw =
    typeof body.thread_id === "string" && body.thread_id.trim()
      ? body.thread_id.trim()
      : randomUUID();
  const workspaceRaw =
    typeof body.workspaceId === "string" && body.workspaceId.trim()
      ? body.workspaceId.trim()
      : "default";

  return {
    messages,
    threadId: threadRaw,
    workspaceId: resolveWorkspaceId(workspaceRaw),
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

function applyNodeUpdate(tracker: ProgressTracker, nodeName: string): void {
  const key = nodeName.toLowerCase();

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
      summary:
        existing?.summary ??
        "按任务分派 Retriever / Researcher / Analyst / Editor",
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

function finalizeProgress(tracker: ProgressTracker): void {
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
  route: "short" | "supervisor",
  userText = "",
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

  const required = inferRequiredSpecialists(userText);
  const todos: TodoItem[] =
    required.length >= 2
      ? required.map((name) => {
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
        title: "调度专科助手",
        status: "active",
        summary: "按任务分派 Retriever / Researcher / Analyst / Editor",
      },
    ],
  };
}

/** Supervisor 交接话术，不是终稿 — 见 isHandoffNoiseText */

/** 按完整 text 段丢弃交接噪音，保留真实报告 */
function dropHandoffNoiseText(): TransformStream<any, any> {
  let collecting = false;
  let buf: any[] = [];
  let text = "";
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; delta?: string };
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
          for (const c of buf) controller.enqueue(c);
        }
        buf = [];
        text = "";
        return;
      }
      if (collecting) {
        for (const c of buf) controller.enqueue(c);
        buf = [];
        collecting = false;
        text = "";
      }
      controller.enqueue(chunk);
    },
  });
}

/** 需要 Editor 终稿时，隐藏专科中间叙述，避免把 NO_HIT / 任务规划刷给用户 */
function suppressIntermediateText(opts: {
  hideUntilEditor: boolean;
  /** 仅解锁 UI 正文，不得记入 ranSpecialists */
  textUnlocked: () => boolean;
  unlockText?: () => void;
}): TransformStream<any, any> {
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; toolName?: string };
      if (
        opts.hideUntilEditor &&
        obj?.type === "tool-input-start" &&
        /transfer_to_editor/i.test(obj.toolName ?? "")
      ) {
        opts.unlockText?.();
      }
      if (!opts.hideUntilEditor || opts.textUnlocked()) {
        controller.enqueue(chunk);
        return;
      }
      const t = obj?.type;
      if (t === "text-start" || t === "text-delta" || t === "text-end") {
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

@Injectable()
export class AgentService {
  /**
   * 将 UIMessage 流转写到 Express Response。
   * GraphRecursionError / 工具降级时尽量写出可读错误或部分文本（D-16）。
   */
  async streamChat(body: AgentChatBody, res: Response): Promise<void> {
    assertModelConfigured();
    ensureLangSmithProjectHint();

    const parsed = parseAgentChatBody(body);
    const lcMessages = await toBaseMessages(parsed.messages);
    const userText = lastUserText(lcMessages);
    const route = resolveAgentRoute(userText);
    const runConfig = getAgentRunConfig(parsed.threadId);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        setKbSearchContextForThread(parsed.threadId, {
          userText,
          workspaceId: parsed.workspaceId,
        });
        try {
          const requiredEarly = inferRequiredSpecialists(userText);
          const trace = createAgentTraceCollector({
            threadId: parsed.threadId,
            userText,
            intent: {
              route,
              requiredSpecialists: requiredEarly,
            },
            langsmithProject: process.env.LANGSMITH_PROJECT?.trim(),
          });
          const { todos, steps } = buildInitialProgress(route, userText);
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
            if (route === "short") {
            const graph = await buildAgentGraph();
            const lgStream = await graph.stream(
              { messages: lcMessages },
              {
                streamMode: ["messages", "values"] as const,
                recursionLimit: runConfig.recursionLimit,
                configurable: {
                  ...runConfig.configurable,
                  workspaceId: parsed.workspaceId,
                  userText,
                },
              },
            );
            await writer.merge(
              toUIMessageStream(lgStream)
                .pipeThrough(stripMergedStart())
                .pipeThrough(dropOrphanToolOutputs()),
            );
            trace.recordSpecialist(
              "System",
              "闲聊短路 · 未进入 Supervisor 多 Agent",
            );
            emitTrace();
          } else {
            const required = requiredEarly;
            const hideUntilEditor = required.includes("editor");
            const supervisorGraph = await buildSupervisorGraph({
              userText,
            });
            const tracker = createProgressTracker(todos, steps, () => {
              emitTracker(tracker, writer, parsed.threadId);
            });
            const streamConfig = {
              streamMode: ["updates", "values", "messages"] as [
                "updates",
                "values",
                "messages",
              ],
              recursionLimit: runConfig.recursionLimit,
              configurable: {
                ...runConfig.configurable,
                workspaceId: parsed.workspaceId,
                userText,
              },
            };
            const citationBag = new Map<string, Citation>();
            const textGate = { open: !hideUntilEditor };
            let visibleReportChars = 0;
            let finalBuf = "";

            // 代码侧预检索：不依赖 Retriever LLM 是否真的调用 kb_search
            const kbPrefetch = await invokeKbSearch({
              query: userText,
              userText,
              workspaceId: parsed.workspaceId,
            });
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
            }
            const seededMessages = [
              new SystemMessage(
                [
                  "【知识库预检索·工具结果·可信】",
                  "以下由服务端直接调用 kb_search 得到；子 Agent 必须采信，禁止编造相反的命中/未命中结论。",
                  kbPrefetch,
                ].join("\n"),
              ),
              ...lcMessages,
            ];

            const drainGraphStream = async (input: {
              messages: unknown;
            }): Promise<void> => {
              const lgStream = await supervisorGraph.stream(
                input as { messages: typeof lcMessages },
                streamConfig,
              );
              const uiSource = forwardUiEvents(lgStream, (update) => {
                collectCitationsFromUpdate(
                  update,
                  citationBag,
                  tracker,
                  trace,
                );
                for (const nodeName of Object.keys(update)) {
                  const before = tracker.activeSpecialist;
                  applyNodeUpdate(tracker, nodeName);
                  const key = nodeName.toLowerCase();
                  if (SPECIALIST_META[key] && tracker.activeSpecialist === key) {
                    const meta = SPECIALIST_META[key]!;
                    if (before !== key) {
                      trace.recordSpecialist(
                        meta.agent,
                        `${meta.title} · ${meta.summary}`,
                      );
                    }
                  }
                  if (nodeName.toLowerCase() === "editor") {
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
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const obj = value as {
                  type?: string;
                  delta?: string;
                  toolName?: string;
                };
                if (obj?.type === "error") tracker.sawError = true;
                if (obj?.type === "tool-input-start" && obj.toolName) {
                  trace.recordTool({
                    name: obj.toolName,
                    summary: `调用 ${obj.toolName}`,
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
            };

            await drainGraphStream({ messages: seededMessages });

            // 提示词不够时：代码强制续跑缺失专科（尤其 editor）
            let forceRound = 0;
            while (
              !tracker.sawError &&
              forceRound < MAX_FORCE_CONTINUE_ROUNDS
            ) {
              const next = nextRequiredSpecialist(
                required,
                tracker.ranSpecialists,
              );
              // Editor 已调度但正文几乎为空：继续强制要报告
              const editorNeedsBody =
                required.includes("editor") &&
                tracker.ranSpecialists.has("editor") &&
                visibleReportChars < 200;
              if (!next && !editorNeedsBody) break;
              const missing = missingRequiredSpecialists(
                required,
                tracker.ranSpecialists,
              );
              const target = next ?? "editor";
              forceRound += 1;
              trace.recordSpecialist(
                "System",
                `强制续跑 #${forceRound} → ${target}`,
              );
              const kbMiss =
                target === "editor" &&
                (tracker.kbNoRelevantHit ||
                  (tracker.ranSpecialists.has("retriever") &&
                    citationBag.size === 0));
              await drainGraphStream({
                messages: [
                  new HumanMessage(
                    buildForceContinueNudge(
                      target,
                      missing.length ? missing : ["editor"],
                      {
                        kbNoRelevantHit: kbMiss,
                      },
                    ) +
                      (editorNeedsBody
                        ? " 上轮未出现报告正文：禁止再输出「请等待」，必须立刻产出完整 Markdown 报告。"
                        : ""),
                  ),
                ],
              });
            }

            if (
              tracker.ranSpecialists.has("retriever") &&
              citationBag.size === 0
            ) {
              tracker.kbNoRelevantHit = true;
            }

            if (!tracker.sawError) {
              if (
                tracker.kbNoRelevantHit ||
                (tracker.ranSpecialists.has("retriever") &&
                  citationBag.size === 0)
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
              finalizeProgress(tracker);
              trace.recordPlan(
                tracker.todos.map((t) => ({
                  id: t.id,
                  label: t.label,
                  status: t.status,
                })),
              );
              const citations = [...citationBag.values()];
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
          const name = err instanceof Error ? err.name : "";
          const msg = err instanceof Error ? err.message : String(err);
          const isRecursion =
            name === "GraphRecursionError" || /recursion/i.test(msg);
          const errorText = isRecursion
            ? `任务步数达到上限，已停止继续调度 · 可重试或改回 Chat（${msg}）`
            : `${msg || "Agent 执行失败"} · 可重试或改回 Chat`;

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
          }
        } finally {
          clearKbSearchContextForThread(parsed.threadId);
        }
      },
      onError: (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        return `${msg} · 可重试或改回 Chat`;
      },
    });

    pipeUIMessageStreamToResponse({
      response: res,
      stream,
    });
  }
}
