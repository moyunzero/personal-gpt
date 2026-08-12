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

import {
  buildAgentGraph,
  getAgentRunConfig,
  lastUserText,
  resolveAgentRoute,
} from "../graph/build-graph";
import { resolveWorkspaceId } from "../rag/retrieve";

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
  const groq = process.env.GROQ_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (!groq && !openai) {
    throw new ModelConfigError(
      "聊天模型未配置：请设置 GROQ_API_KEY 或 OPENAI_API_KEY · 可重试或改回 Chat",
    );
  }
}

/** 建议 LangSmith project=personal-gpt-agent（D-18）；缺省时 fail-open 不阻断 */
function ensureLangSmithProjectHint(): void {
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

function buildInitialProgress(route: "short" | "supervisor"): {
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

  return {
    todos: [
      { id: "todo-retrieve", label: "检索知识库", status: "pending" },
      { id: "todo-research", label: "联网补充（如需）", status: "pending" },
      { id: "todo-analyze", label: "分析整理", status: "pending" },
      { id: "todo-report", label: "撰写报告", status: "active" },
    ],
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
        const { todos, steps } = buildInitialProgress(route);

        if (todos.length > 0) {
          writer.write({
            type: "data-todo-update",
            id: `todo-${parsed.threadId}`,
            data: { todos },
          });
        }

        for (const step of steps) {
          writer.write({
            type: "data-agent-step",
            id: step.id,
            data: step,
          });
        }

        try {
          const graph = await buildAgentGraph();
          const lgStream = await graph.stream(
            { messages: lcMessages },
            {
              streamMode: ["messages", "values", "custom"] as const,
              recursionLimit: runConfig.recursionLimit,
              configurable: {
                ...runConfig.configurable,
                workspaceId: parsed.workspaceId,
              },
            },
          );

          writer.merge(toUIMessageStream(lgStream));
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
          writer.write({
            type: "data-agent-step",
            id: "step-error",
            data: {
              id: "step-error",
              agent: "System",
              title: "执行降级",
              status: "error",
              summary: errorText,
            } satisfies AgentStepPayload,
          });
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
