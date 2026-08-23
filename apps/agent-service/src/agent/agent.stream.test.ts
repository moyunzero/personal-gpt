/**
 * AGENT-04：Nest Agent SSE — 不再透传 web /api/chat；走 LangGraph → UIMessage 流。
 * mock graph.stream；禁止 live LLM。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const streamMock = vi.fn();
const buildAgentGraphMock = vi.fn();
const buildSupervisorGraphMock = vi.fn();
const buildExecutionGraphMock = vi.fn();
const resolveIntentPlanForAgentMock = vi.fn();
const invokeGraphSearchMock = vi.fn();
const invokeKbSearchMock = vi.fn();
const toBaseMessagesMock = vi.fn();
const toUIMessageStreamMock = vi.fn();
const pipeUIMessageStreamToResponseMock = vi.fn();
const createUIMessageStreamMock = vi.fn();

vi.mock("../routing/intent-plan", () => ({
  resolveIntentPlanForAgent: (...args: unknown[]) => resolveIntentPlanForAgentMock(...args),
  probeNeo4jAvailable: vi.fn(async () => true),
  resetNeo4jAvailabilityCacheForTests: vi.fn(),
}));

vi.mock("../graph/build-graph", () => ({
  buildAgentGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
  buildSupervisorGraph: (...args: unknown[]) => buildSupervisorGraphMock(...args),
  buildExecutionGraph: (...args: unknown[]) => buildExecutionGraphMock(...args),
  isRetrieverSynthesisPlan: (plan: {
    specialists: string[];
    retrieverTools: string[];
    primary: string;
  }) =>
    plan.specialists[0] === "retriever" &&
    plan.retrieverTools.length > 0 &&
    (plan.primary === "kb_doc" ||
      plan.primary === "graph_relation" ||
      plan.primary === "kb_graph_hybrid"),
  resolveExecutionMode: (plan: { primary: string; specialists: string[]; ambiguous?: boolean }) => {
    if (plan.primary === "chitchat") return "short";
    if (plan.ambiguous) return "supervisor";
    if (plan.specialists.length >= 2) return "sequential";
    if (plan.specialists.length === 1) return "single_specialist";
    return "supervisor";
  },
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
  invokeKbSearch: (...args: unknown[]) => invokeKbSearchMock(...args),
}));

vi.mock("../tools/graph-search.tool", () => ({
  invokeGraphSearch: (...args: unknown[]) => invokeGraphSearchMock(...args),
}));

const GRAPH_PLAN = {
  primary: "graph_relation" as const,
  channels: "graph" as const,
  specialists: ["retriever"],
  retrieverTools: ["graph_search"],
  fallbackChain: ["kb_search"],
  reason: "l0:graph_relation:seed_entity",
  confidence: 0.95,
  graphSignal: true,
};

const KB_PLAN_NO_GRAPH = {
  primary: "kb_doc" as const,
  channels: "kb" as const,
  specialists: ["retriever"],
  retrieverTools: ["kb_search"],
  fallbackChain: [],
  reason: "l1:kb_doc",
  confidence: 0.8,
  graphSignal: false,
};

const KB_PLAN_WITH_GRAPH_FALLBACK = {
  ...KB_PLAN_NO_GRAPH,
  fallbackChain: ["graph_search"],
  graphSignal: true,
};

describe("Agent SSE stream (AGENT-04)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchSpy.mockReset();
    streamMock.mockReset();
    buildAgentGraphMock.mockReset();
    buildSupervisorGraphMock.mockReset();
    buildExecutionGraphMock.mockReset();
    resolveIntentPlanForAgentMock.mockReset();
    invokeGraphSearchMock.mockReset();
    invokeKbSearchMock.mockReset();
    toBaseMessagesMock.mockReset();
    toUIMessageStreamMock.mockReset();
    pipeUIMessageStreamToResponseMock.mockReset();
    createUIMessageStreamMock.mockReset();

    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.ENABLE_INTENT_ROUTER = "true";

    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: GRAPH_PLAN,
      layers: ["L0"],
    });
    invokeGraphSearchMock.mockResolvedValue("GRAPH_SEARCH_STATUS: HIT\n珍珠奶茶 path summary");
    invokeKbSearchMock.mockResolvedValue(
      ["KB_SEARCH_STATUS: NO_RELEVANT_HIT", "No relevant knowledge base hits."].join("\n"),
    );

    toBaseMessagesMock.mockResolvedValue([{ content: "对比 LangGraph 与 AutoGen" }]);
    streamMock.mockImplementation(() =>
      (async function* () {
        yield ["messages", [{ content: "ok" }]];
      })(),
    );
    buildAgentGraphMock.mockResolvedValue({ stream: streamMock });
    buildSupervisorGraphMock.mockResolvedValue({ stream: streamMock, updateState: vi.fn() });
    buildExecutionGraphMock.mockResolvedValue({ stream: streamMock, updateState: vi.fn() });
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

    expect(buildExecutionGraphMock).toHaveBeenCalled();
    expect(buildSupervisorGraphMock).not.toHaveBeenCalled();
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

  it("short route emits greeting text without LangGraph stream", async () => {
    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: {
        primary: "chitchat",
        channels: "none",
        specialists: [],
        retrieverTools: [],
        fallbackChain: [],
        reason: "l0:chitchat",
        confidence: 1,
      },
      layers: ["L0"],
    });
    toBaseMessagesMock.mockResolvedValue([{ content: "你好" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "你好" }] }],
        thread_id: "t-short-text",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(buildAgentGraphMock).not.toHaveBeenCalled();
    expect(buildSupervisorGraphMock).not.toHaveBeenCalled();
    expect(toUIMessageStreamMock).not.toHaveBeenCalled();
    const writes = streamArg?.__writes ?? [];
    const text = writes
      .filter((w) => (w as { type?: string }).type === "text-delta")
      .map((w) => (w as { delta?: string }).delta ?? "")
      .join("");
    expect(text).toMatch(/你好|助手|知识库/);
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

  it("suppressIntermediateText drops non-report held text on first unlock", async () => {
    const { suppressIntermediateText } = await import("./agent.service");
    let unlocked = false;
    const out: unknown[] = [];
    const input = new TransformStream();
    const done = input.readable
      .pipeThrough(
        suppressIntermediateText({
          hideUntilEditor: true,
          textUnlocked: () => unlocked,
        }),
      )
      .pipeTo(
        new WritableStream({
          write(chunk) {
            out.push(chunk);
          },
        }),
      );
    const w = input.writable.getWriter();
    await w.write({ type: "text-start", id: "miss" });
    await w.write({ type: "text-delta", id: "miss", delta: "知识库未找到足够相关依据。" });
    await w.write({ type: "text-end", id: "miss" });
    unlocked = true;
    await w.write({ type: "text-start", id: "report" });
    await w.write({ type: "text-delta", id: "report", delta: "# 韶音手册\n\n正文" });
    await w.write({ type: "text-end", id: "report" });
    await w.close();
    await done;
    const deltas = out
      .filter((c) => (c as { type?: string }).type === "text-delta")
      .map((c) => (c as { delta: string }).delta);
    expect(deltas.join("")).toBe("# 韶音手册\n\n正文");
    expect(deltas.join("")).not.toMatch(/知识库未找到/);
  });

  it("suppressIntermediateText keeps report-like held text on unlock", async () => {
    const { suppressIntermediateText } = await import("./agent.service");
    let unlocked = false;
    const out: unknown[] = [];
    const report = "# 标题\n\n" + "段落内容。".repeat(80);
    const input = new TransformStream();
    const done = input.readable
      .pipeThrough(
        suppressIntermediateText({
          hideUntilEditor: true,
          textUnlocked: () => unlocked,
        }),
      )
      .pipeTo(
        new WritableStream({
          write(chunk) {
            out.push(chunk);
          },
        }),
      );
    const w = input.writable.getWriter();
    await w.write({ type: "text-start", id: "r1" });
    await w.write({ type: "text-delta", id: "r1", delta: report });
    await w.write({ type: "text-end", id: "r1" });
    unlocked = true;
    await w.write({ type: "tool-input-start", toolName: "noop" });
    await w.close();
    await done;
    const deltas = out
      .filter((c) => (c as { type?: string }).type === "text-delta")
      .map((c) => (c as { delta: string }).delta);
    expect(deltas.join("")).toBe(report);
  });

  it("graph_relation plan uses buildExecutionGraph single_specialist (D-04, D-16)", async () => {
    toBaseMessagesMock.mockResolvedValue([{ content: "珍珠奶茶有哪些原料，用了什么工艺？" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "g1",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        thread_id: "t-graph-plan",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(buildExecutionGraphMock).toHaveBeenCalled();
    expect(buildSupervisorGraphMock).not.toHaveBeenCalled();
  });

  it("synthesis path skips duplicate service-level graph prefetch (D-11 rag_generate)", async () => {
    toBaseMessagesMock.mockResolvedValue([{ content: "珍珠奶茶有哪些原料，用了什么工艺？" }]);
    invokeGraphSearchMock.mockClear();
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "g2",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        thread_id: "t-graph-prefetch",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(invokeGraphSearchMock).not.toHaveBeenCalled();
    expect(streamMock.mock.calls[0]?.[0]).toBeTruthy();
  });

  it("kb NO_HIT + graphSignal: synthesis defers prefetch to graph (D-05, D-13)", async () => {
    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: KB_PLAN_WITH_GRAPH_FALLBACK,
      layers: ["L1"],
    });
    invokeKbSearchMock.mockClear();
    invokeGraphSearchMock.mockClear();
    toBaseMessagesMock.mockResolvedValue([{ content: "差旅报销政策有哪些条款？" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "k1",
            role: "user",
            parts: [{ type: "text", text: "差旅报销政策有哪些条款？" }],
          },
        ],
        thread_id: "t-kb-graph-fallback",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(invokeKbSearchMock).not.toHaveBeenCalled();
    expect(invokeGraphSearchMock).not.toHaveBeenCalled();
  });

  it("kb prefetch without graphSignal invokes kb_search but NOT graph_search (D-13 negative)", async () => {
    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: {
        primary: "general" as const,
        channels: "kb" as const,
        specialists: ["retriever"],
        retrieverTools: ["kb_search"],
        fallbackChain: [],
        reason: "l1:kb_without_graph",
        confidence: 0.8,
        graphSignal: false,
      },
      layers: ["L1"],
    });
    invokeKbSearchMock.mockResolvedValue("KB_SEARCH_STATUS: HIT\n[citation documentId: doc-1]");
    invokeGraphSearchMock.mockClear();
    invokeKbSearchMock.mockClear();
    toBaseMessagesMock.mockResolvedValue([{ content: "差旅报销政策有哪些条款？" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "k2",
            role: "user",
            parts: [{ type: "text", text: "差旅报销政策有哪些条款？" }],
          },
        ],
        thread_id: "t-kb-no-graph",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(invokeKbSearchMock).toHaveBeenCalled();
    expect(invokeGraphSearchMock).not.toHaveBeenCalled();
  });

  it("ENABLE_INTENT_ROUTER=false uses legacy buildSupervisorGraph (D-10)", async () => {
    process.env.ENABLE_INTENT_ROUTER = "false";
    toBaseMessagesMock.mockResolvedValue([{ content: "对比 LangGraph 与 AutoGen" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "leg1",
            role: "user",
            parts: [{ type: "text", text: "对比 LangGraph 与 AutoGen 并写报告" }],
          },
        ],
        thread_id: "t-legacy-router",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(buildSupervisorGraphMock).toHaveBeenCalled();
    expect(buildExecutionGraphMock).not.toHaveBeenCalled();
    expect(resolveIntentPlanForAgentMock).not.toHaveBeenCalled();
  });

  it("trace intent includes graph_relation plan for H-04 fixture (D-06, D-08)", async () => {
    const graphOut = [
      "GRAPH_SEARCH_STATUS: HIT",
      "nodes:",
      "  - id=product:pearl-milk-tea labels=Product name=珍珠奶茶",
    ].join("\n");
    streamMock.mockImplementation(() =>
      (async function* () {
        yield ["updates", { prefetch: { messages: [{ content: graphOut }] } }];
      })(),
    );
    toBaseMessagesMock.mockResolvedValue([{ content: "珍珠奶茶有哪些原料，用了什么工艺？" }]);
    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "h4",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        thread_id: "t-h4-trace",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    const tracePart = streamArg?.__writes?.find(
      (w) => (w as { type?: string }).type === "data-agent-trace",
    ) as Record<string, unknown> | undefined;
    const traceData = tracePart?.data as {
      intent?: { plan?: { primary?: string }; route?: string };
      events?: Array<{ name?: string }>;
    };
    expect(traceData?.intent?.plan?.primary).toBe("graph_relation");
    expect(traceData?.intent?.route).toBe("single_specialist");
    const toolEvents = traceData?.events?.filter((e) => e.name === "graph_search");
    expect(toolEvents?.length).toBeGreaterThan(0);
  });

  it("graph HIT suppresses KB miss note and injects fallback when LLM is silent (D-06 UX)", async () => {
    const graphOut = [
      "GRAPH_SEARCH_STATUS: HIT",
      "nodes:",
      "  - id=product:pearl-milk-tea labels=Product name=珍珠奶茶",
      "  - id=ingredient:tapioca labels=Ingredient name=珍珠",
    ].join("\n");
    toBaseMessagesMock.mockResolvedValue([{ content: "珍珠奶茶有哪些原料，用了什么工艺？" }]);
    streamMock.mockImplementation(() =>
      (async function* () {
        yield ["updates", { prefetch: { messages: [{ content: graphOut }] } }];
      })(),
    );
    toUIMessageStreamMock.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }).pipeThrough(new TransformStream()),
    );

    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "gx",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        thread_id: "t-graph-no-kb-miss",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    const deltas = (streamArg?.__writes ?? [])
      .filter((w) => (w as { type?: string }).type === "text-delta")
      .map((w) => (w as { delta?: string }).delta ?? "")
      .join("");
    expect(deltas).not.toMatch(/知识库未找到足够依据/);
    expect(deltas).toMatch(/珍珠奶茶/);
  });

  it("kb HIT injects citation fallback when LLM wrongly reports miss (D-11 synthesis)", async () => {
    const KB_HIT = [
      "KB_SEARCH_STATUS: HIT",
      "知识库检索结果（workspace=default，来源=知识库，minSimilarity=0.60）：",
      "[citation 1]",
      "title: 红烧肉的做法",
      "source: recipe.md",
      "documentId: doc-braise",
      "chunkIndex: 0",
      "similarity: 0.920",
      "workspaceId: default",
      "snippet: 五花肉切块焯水，加冰糖炒糖色，慢火炖40分钟。",
    ].join("\n\n");

    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: KB_PLAN_NO_GRAPH,
      layers: ["L1"],
    });
    invokeKbSearchMock.mockClear();
    toBaseMessagesMock.mockResolvedValue([{ content: "怎么做红烧肉？" }]);
    streamMock.mockImplementation(() =>
      (async function* () {
        yield [
          "updates",
          {
            prefetch: { messages: [{ content: KB_HIT }] },
            synthesizer: {
              messages: [
                {
                  content: "知识库未找到足够相关依据。\nKB_SEARCH_STATUS: NO_RELEVANT_HIT",
                },
              ],
            },
          },
        ];
      })(),
    );
    toUIMessageStreamMock.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "text-delta",
            id: "r1",
            delta: "知识库未找到足够相关依据。",
          });
          controller.close();
        },
      }).pipeThrough(new TransformStream()),
    );

    const { AgentService } = await import("./agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "kb1",
            role: "user",
            parts: [{ type: "text", text: "怎么做红烧肉？" }],
          },
        ],
        thread_id: "t-kb-hit-fallback",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    const deltas = (streamArg?.__writes ?? [])
      .filter((w) => (w as { type?: string }).type === "text-delta")
      .map((w) => (w as { delta?: string }).delta ?? "")
      .join("");
    expect(deltas).toMatch(/五花肉切块焯水/);
    expect(deltas).toMatch(/红烧肉的做法/);
    expect(deltas).not.toMatch(/说明：知识库未找到足够依据/);
    const citePart = streamArg?.__writes?.find(
      (w) => (w as { type?: string }).type === "data-citations",
    ) as { data?: { citations?: Array<{ documentId?: string }> } } | undefined;
    expect(citePart?.data?.citations?.[0]?.documentId).toBe("doc-braise");
  });
});
