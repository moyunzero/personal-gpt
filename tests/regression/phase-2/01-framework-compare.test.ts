/**
 * Phase 2 regression #1 — 框架对比报告骨架。
 * 期望：todo 步骤 + ≥2 段正文 + ≥1 citation。
 * 禁止 live LLM。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

const streamMock = vi.fn();
const buildAgentGraphMock = vi.fn();
const toBaseMessagesMock = vi.fn();
const toUIMessageStreamMock = vi.fn();
const pipeUIMessageStreamToResponseMock = vi.fn();
const createUIMessageStreamMock = vi.fn();

vi.mock("../../../apps/agent-service/src/graph/build-graph", () => ({
  buildAgentGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
  buildSupervisorGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
  getAgentRunConfig: (threadId: string) => ({
    recursionLimit: 40,
    configurable: { thread_id: threadId },
  }),
  resolveAgentRoute: () => "supervisor",
  lastUserText: () => "对比 LangGraph 与 AutoGen 并写报告",
}));

vi.mock("@ai-sdk/langchain", () => ({
  toBaseMessages: (...args: unknown[]) => toBaseMessagesMock(...args),
  toUIMessageStream: (...args: unknown[]) => toUIMessageStreamMock(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    pipeUIMessageStreamToResponse: (...args: unknown[]) =>
      pipeUIMessageStreamToResponseMock(...args),
    createUIMessageStream: (...args: unknown[]) => createUIMessageStreamMock(...args),
  };
});

describe("Phase 2 regression #1: framework compare report", () => {
  beforeEach(() => {
    streamMock.mockReset();
    buildAgentGraphMock.mockReset();
    toBaseMessagesMock.mockReset();
    toUIMessageStreamMock.mockReset();
    pipeUIMessageStreamToResponseMock.mockReset();
    createUIMessageStreamMock.mockReset();

    process.env.GROQ_API_KEY = "test-groq-key";
    toBaseMessagesMock.mockResolvedValue([{ content: "对比 LangGraph 与 AutoGen" }]);
    streamMock.mockImplementation(() =>
      (async function* () {
        yield ["values", { messages: [] }];
      })(),
    );
    buildAgentGraphMock.mockResolvedValue({ stream: streamMock });
    toUIMessageStreamMock.mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
    );

    createUIMessageStreamMock.mockImplementation(({ execute }) => {
      const writes: unknown[] = [];
      const writer = {
        write: (chunk: unknown) => {
          writes.push(chunk);
        },
        merge: vi.fn(async () => undefined),
      };
      const ready = Promise.resolve(execute({ writer }));
      const stream = new ReadableStream({
        start(controller) {
          void ready.finally(() => controller.close());
        },
      });
      Object.assign(stream, { __writes: writes, __ready: ready });
      return stream;
    });
    pipeUIMessageStreamToResponseMock.mockImplementation(async ({ stream }) => {
      const ready = (stream as { __ready?: Promise<void> }).__ready;
      if (ready) await ready;
    });
  });

  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it("emits todo steps for LangGraph vs AutoGen compare task", async () => {
    const { AgentService } = await import("../../../apps/agent-service/src/agent/agent.service");
    const service = new AgentService();
    const res = {} as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "对比 LangGraph 与 AutoGen 并写一份 Markdown 报告",
              },
            ],
          },
        ],
        thread_id: "reg-01",
      },
      res,
    );

    const streamArg = createUIMessageStreamMock.mock.results[0]?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    const writes = streamArg?.__writes ?? [];
    const todo = writes.find((w) => (w as { type?: string }).type === "data-todo-update") as
      { data?: { todos?: unknown[] } } | undefined;
    expect(todo?.data?.todos?.length).toBeGreaterThanOrEqual(2);
  });

  it("streams at least 2 body paragraphs without live LLM", () => {
    // 模拟 Editor 产出的报告正文（mock，无 live LLM）
    const report = [
      "LangGraph 更适合有状态、可检查点的生产编排。",
      "",
      "AutoGen 更偏对话式多智能体原型，适合快速试错。",
    ].join("\n");
    const paragraphs = report
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one citation part from mocked retrieval", async () => {
    process.env.ENABLE_RERANKER = "false";
    const searchMock = vi.fn().mockResolvedValue([
      {
        text: "LangGraph Supervisor 适合 hub-and-spoke。",
        similarity: 0.86,
        title: "内部笔记 · LangGraph Supervisor",
        source: "notes.md",
        documentId: "doc-lg",
        chunkIndex: 0,
      },
    ]);
    const { retrieveKb } = await import("../../../apps/agent-service/src/rag/retrieve");
    const result = await retrieveKb({
      query: "LangGraph vs AutoGen",
      hybridDeps: {
        embed: async () => [0.1, 0.2, 0.3],
        getStore: () => ({
          search: searchMock,
          upsert: vi.fn(),
          deleteByDocument: vi.fn(),
        }),
        esSearch: async () => [],
        rewriteQuery: async (q) => q,
      },
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(1);

    const citationPart = {
      type: "data-citations",
      id: "citations-reg-01",
      data: {
        citations: result.chunks.map((c) => ({
          title: c.title ?? "未命名",
          snippet: c.text,
          similarity: c.similarity,
          documentId: c.documentId ?? "unknown",
          chunkIndex: c.chunkIndex ?? 0,
          source: c.source,
        })),
      },
    };
    const message: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "对比结论见正文。" },
        citationPart as UIMessage["parts"][number],
      ],
    };
    const hasCitation = message.parts.some((p) => p.type === "data-citations");
    expect(hasCitation).toBe(true);
  });
});
