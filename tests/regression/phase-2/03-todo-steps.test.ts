/**
 * Phase 2 regression #3 — 可见 todo / 步骤事件。
 * 期望：SSE 含 todo-update / agent-step（或等价 data part）。
 * 禁止 live LLM。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const streamMock = vi.fn();
const buildAgentGraphMock = vi.fn();
const toBaseMessagesMock = vi.fn();
const toUIMessageStreamMock = vi.fn();
const pipeUIMessageStreamToResponseMock = vi.fn();
const createUIMessageStreamMock = vi.fn();

vi.mock("../../../apps/agent-service/src/graph/build-graph", () => ({
  buildAgentGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
  getAgentRunConfig: (threadId: string) => ({
    recursionLimit: 40,
    configurable: { thread_id: threadId },
  }),
  resolveAgentRoute: (text: string) =>
    /你好|天气/.test(text) ? "short" : "supervisor",
  lastUserText: (messages: { content?: unknown }[]) => {
    const last = messages?.at(-1);
    return typeof last?.content === "string" ? last.content : "调研并写报告";
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

async function runAgentChat(text: string) {
  const { AgentService } = await import(
    "../../../apps/agent-service/src/agent/agent.service"
  );
  const service = new AgentService();
  const res = {} as import("express").Response;
  await service.streamChat(
    {
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text }],
        },
      ],
      thread_id: "reg-03",
    },
    res,
  );
  const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
    __writes?: unknown[];
    __ready?: Promise<void>;
  };
  await streamArg?.__ready;
  return streamArg?.__writes ?? [];
}

describe("Phase 2 regression #3: visible todo and agent-step events", () => {
  beforeEach(() => {
    streamMock.mockReset();
    buildAgentGraphMock.mockReset();
    toBaseMessagesMock.mockReset();
    toUIMessageStreamMock.mockReset();
    pipeUIMessageStreamToResponseMock.mockReset();
    createUIMessageStreamMock.mockReset();

    process.env.GROQ_API_KEY = "test-groq-key";
    toBaseMessagesMock.mockImplementation(async (messages: { parts?: { text?: string }[] }[]) => {
      const text = messages[0]?.parts?.[0]?.text ?? "调研";
      return [{ content: text }];
    });
    streamMock.mockResolvedValue(
      (async function* () {
        yield ["messages", [{ content: "ok" }]];
      })(),
    );
    buildAgentGraphMock.mockResolvedValue({ stream: streamMock });
    toUIMessageStreamMock.mockReturnValue(new ReadableStream());

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

  it("emits todo-update parts during multi-agent research task", async () => {
    const writes = await runAgentChat("调研 LangGraph 生态并生成对比报告");
    const types = writes.map((w) => (w as { type?: string }).type);
    expect(types).toContain("data-todo-update");
    const todo = writes.find((w) => (w as { type?: string }).type === "data-todo-update") as {
      data?: { todos?: unknown[] };
    };
    expect((todo.data?.todos ?? []).length).toBeGreaterThan(0);
  });

  it("emits agent-step events for Supervisor / worker handoffs", async () => {
    const writes = await runAgentChat("对比框架并分派专科助手");
    const steps = writes.filter((w) => (w as { type?: string }).type === "data-agent-step") as {
      data?: { agent?: string; title?: string };
    }[];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => /Supervisor|调度/i.test(`${s.data?.agent ?? ""} ${s.data?.title ?? ""}`))).toBe(
      true,
    );
  });
});
