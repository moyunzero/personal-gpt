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
  resolveAgentRoute: (text: string) => (/你好|天气/.test(text) ? "short" : "supervisor"),
  lastUserText: (messages: { content?: unknown }[]) => {
    const last = messages?.at(-1);
    return typeof last?.content === "string" ? last.content : "";
  },
  shouldUseSequentialPipeline: (required: unknown[]) =>
    Array.isArray(required) && required.length >= 2,
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
    ["KB_SEARCH_STATUS: NO_RELEVANT_HIT", "No relevant knowledge base hits."].join("\n"),
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

  it("rejects unsafe thread_id and falls back to UUID when blank", async () => {
    const { parseAgentChatBody } = await import("./agent.service");
    expect(() =>
      parseAgentChatBody({
        messages: [{ role: "user" }],
        thread_id: "../etc/passwd",
      }),
    ).toThrow(/thread_id/i);
    expect(() =>
      parseAgentChatBody({
        messages: [{ role: "user" }],
        thread_id: "a/b",
      }),
    ).toThrow(/thread_id/i);
    const ok = parseAgentChatBody({
      messages: [{ role: "user" }],
      thread_id: "  ",
    });
    expect(ok.threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
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
    expect(types.some((t) => t === "data-todo-update" || t === "data-agent-step")).toBe(true);
    const tracePart = writes.find((w) => (w as { type?: string }).type === "data-agent-trace") as
      { data?: { events?: unknown[] } } | undefined;
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

  it("awaits pipeUIMessageStreamToResponse before streamChat resolves", async () => {
    let pipeFinished = false;
    pipeUIMessageStreamToResponseMock.mockImplementation(async ({ stream }) => {
      const ready = (stream as { __ready?: Promise<void> }).__ready;
      if (ready) await ready;
      await new Promise((r) => setTimeout(r, 20));
      pipeFinished = true;
    });

    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "你好" }] }],
        thread_id: "t-await-pipe",
      },
      res,
    );
    expect(pipeFinished).toBe(true);
  });

  it("passes AbortSignal and run_id into graph.stream config", async () => {
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const { EventEmitter } = await import("node:events");
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
    }) as unknown as import("express").Response;

    await service.streamChat(
      {
        messages: [
          {
            id: "1",
            role: "user",
            parts: [{ type: "text", text: "对比 LangGraph 与 AutoGen 并写报告" }],
          },
        ],
        thread_id: "t-run-id",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;

    expect(streamMock).toHaveBeenCalled();
    const cfg = streamMock.mock.calls[0]?.[1] as {
      signal?: AbortSignal;
      configurable?: { run_id?: string; thread_id?: string };
    };
    expect(cfg?.signal).toBeInstanceOf(AbortSignal);
    expect(cfg?.configurable?.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(cfg?.configurable?.thread_id).toBe("t-run-id");
  });

  it("attachResponseAbortSignal aborts when response closes", async () => {
    const { attachResponseAbortSignal } = await import("./agent.service");
    const { EventEmitter } = await import("node:events");
    const res = new EventEmitter() as unknown as import("express").Response;
    const signal = attachResponseAbortSignal(res);
    expect(signal.aborted).toBe(false);
    (res as unknown as EventEmitter).emit("close");
    expect(signal.aborted).toBe(true);
  });

  it("deduplicateTextDeltas keeps consecutive identical deltas with rising seq", async () => {
    const { deduplicateTextDeltas } = await import("./agent.service");
    const out: unknown[] = [];
    const writer = new WritableStream({
      write(chunk) {
        out.push(chunk);
      },
    });
    const rs = new ReadableStream({
      start(c) {
        c.enqueue({ type: "text-delta", id: "t1", delta: "好", seq: 1 });
        c.enqueue({ type: "text-delta", id: "t1", delta: "好", seq: 2 });
        c.enqueue({ type: "text-delta", id: "t1", delta: "好", seq: 2 }); // 重复事件
        c.close();
      },
    });
    await rs.pipeThrough(deduplicateTextDeltas()).pipeTo(writer);
    expect(out).toHaveLength(2);
    expect((out[0] as { delta: string }).delta).toBe("好");
    expect((out[1] as { delta: string }).delta).toBe("好");
  });

  it("deduplicateTextDeltas without seq drops consecutive identical merge artifacts", async () => {
    const { deduplicateTextDeltas } = await import("./agent.service");
    const out: unknown[] = [];
    const writer = new WritableStream({
      write(chunk) {
        out.push(chunk);
      },
    });
    const rs = new ReadableStream({
      start(c) {
        c.enqueue({ type: "text-delta", id: "t1", delta: "你好" });
        c.enqueue({ type: "text-delta", id: "t1", delta: "你好" });
        c.enqueue({ type: "text-delta", id: "t1", delta: "世界" });
        c.close();
      },
    });
    await rs.pipeThrough(deduplicateTextDeltas()).pipeTo(writer);
    expect(out.map((c) => (c as { delta: string }).delta)).toEqual(["你好", "世界"]);
  });
});
