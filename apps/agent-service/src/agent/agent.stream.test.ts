/**
 * AGENT-04：Nest Agent SSE — 不再透传 web /api/chat；走 LangGraph → UIMessage 流。
 * mock graph.stream；禁止 live LLM。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const streamMock = vi.fn();
const buildAgentGraphMock = vi.fn();
const buildSupervisorGraphMock = vi.fn();
const toBaseMessagesMock = vi.fn();
const toUIMessageStreamMock = vi.fn();
const pipeUIMessageStreamToResponseMock = vi.fn();
const createUIMessageStreamMock = vi.fn();

vi.mock("../graph/build-graph", () => ({
  buildAgentGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
  buildSupervisorGraph: (...args: unknown[]) => buildSupervisorGraphMock(...args),
  getAgentRunConfig: (threadId: string) => ({
    recursionLimit: 40,
    configurable: { thread_id: threadId },
  }),
  resolveAgentRoute: (text: string) =>
    /你好|天气/.test(text) ? "short" : "supervisor",
  lastUserText: (messages: { content?: unknown }[]) => {
    const last = messages?.at(-1);
    return typeof last?.content === "string" ? last.content : "";
  },
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

vi.mock("../tools/kb-search.tool", () => ({
  invokeKbSearch: vi.fn(async () =>
    [
      "KB_SEARCH_STATUS: NO_RELEVANT_HIT",
      "No relevant knowledge base hits.",
    ].join("\n"),
  ),
}));

describe("Agent SSE stream (AGENT-04)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchSpy.mockReset();
    streamMock.mockReset();
    buildAgentGraphMock.mockReset();
    buildSupervisorGraphMock.mockReset();
    toBaseMessagesMock.mockReset();
    toUIMessageStreamMock.mockReset();
    pipeUIMessageStreamToResponseMock.mockReset();
    createUIMessageStreamMock.mockReset();

    process.env.GROQ_API_KEY = "test-groq-key";

    toBaseMessagesMock.mockResolvedValue([{ content: "对比 LangGraph 与 AutoGen" }]);
    streamMock.mockImplementation(() =>
      (async function* () {
        yield ["messages", [{ content: "ok" }]];
      })(),
    );
    buildAgentGraphMock.mockResolvedValue({ stream: streamMock });
    buildSupervisorGraphMock.mockResolvedValue({ stream: streamMock });
    toUIMessageStreamMock.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }).pipeThrough(new TransformStream()),
    );
    createUIMessageStreamMock.mockImplementation(({ execute }) => {
      const writes: unknown[] = [];
      const writer = {
        write: (chunk: unknown) => {
          writes.push(chunk);
        },
        merge: vi.fn(async () => undefined),
      };
      // 立即执行（不等待 pipe 消费 ReadableStream），便于断言 writes / graph.stream
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

  it("rejects invalid body (messages not an array) with 400 semantics", async () => {
    const { parseAgentChatBody } = await import("./agent.service");
    expect(() => parseAgentChatBody({})).toThrow(/messages/i);
    expect(() => parseAgentChatBody({ messages: "nope" })).toThrow(/messages/i);
  });

  it("streams via LangGraph + toUIMessageStream and does not fetch web /api/chat", async () => {
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200 } as unknown as import("express").Response;

    await service.streamChat(
      {
        messages: [
          {
            id: "1",
            role: "user",
            parts: [{ type: "text", text: "对比 LangGraph 与 AutoGen 并写报告" }],
          },
        ],
        thread_id: "t-stream-1",
      },
      res,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    const fetchUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetchUrls.every((u) => !u.includes("/api/chat"))).toBe(true);

    const streamArg = createUIMessageStreamMock.mock.results[0]?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;

    expect(buildSupervisorGraphMock).toHaveBeenCalled();
    expect(buildAgentGraphMock).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalled();
    expect(toUIMessageStreamMock).toHaveBeenCalled();
    expect(pipeUIMessageStreamToResponseMock).toHaveBeenCalled();
    expect(createUIMessageStreamMock).toHaveBeenCalled();
  });

  it("emits agent-step / todo-update data parts via custom writer for supervisor tasks", async () => {
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200 } as unknown as import("express").Response;

    await service.streamChat(
      {
        messages: [
          {
            id: "2",
            role: "user",
            parts: [{ type: "text", text: "对比 LangGraph 与 AutoGen 并写报告" }],
          },
        ],
        thread_id: "t-stream-2",
      },
      res,
    );

    const streamArg = createUIMessageStreamMock.mock.results[0]?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    const writes = streamArg?.__writes ?? [];
    const types = writes.map((w) => (w as { type?: string }).type);
    expect(types.some((t) => t === "data-todo-update" || t === "data-agent-step")).toBe(
      true,
    );
    const tracePart = writes.find(
      (w) => (w as { type?: string }).type === "data-agent-trace",
    ) as { data?: { events?: unknown[] } } | undefined;
    expect(tracePart).toBeTruthy();
    expect(Array.isArray(tracePart?.data?.events)).toBe(true);
    expect((tracePart?.data?.events ?? []).length).toBeGreaterThan(0);
  });

  it("surfaces 503 when model keys are missing", async () => {
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AGENT_PROVIDER;
    const { AgentService, ModelConfigError } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200 } as unknown as import("express").Response;
    await expect(
      service.streamChat(
        {
          messages: [
            {
              id: "3",
              role: "user",
              parts: [{ type: "text", text: "你好" }],
            },
          ],
        },
        res,
      ),
    ).rejects.toBeInstanceOf(ModelConfigError);
  });
});
