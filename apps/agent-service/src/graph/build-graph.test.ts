/**
 * buildAgentGraph 单测：compile、闲聊短路、recursionLimit、checkpointer（无 live LLM）。
 */
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAgentGraph,
  ensureCheckpointerSetup,
  getAgentRunConfig,
  resetCheckpointerSingletonsForTests,
  resolveAgentRoute,
  resolveCheckpointer,
} from "./build-graph";

function mockChatModel() {
  return new ChatOpenAI({
    model: "mock-model",
    apiKey: "sk-test-mock",
    configuration: { baseURL: "http://127.0.0.1:9" },
  });
}

describe("resolveAgentRoute", () => {
  it("routes greetings to short", () => {
    expect(resolveAgentRoute("你好")).toBe("short");
    expect(resolveAgentRoute("今天天气怎么样")).toBe("short");
  });

  it("routes research queries to supervisor", () => {
    expect(resolveAgentRoute("请根据知识库总结差旅报销政策并列出条款出处")).toBe("supervisor");
  });
});

describe("getAgentRunConfig", () => {
  const prev = process.env.AGENT_RECURSION_LIMIT;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.AGENT_RECURSION_LIMIT;
    } else {
      process.env.AGENT_RECURSION_LIMIT = prev;
    }
  });

  it("requires thread_id and defaults recursionLimit to 40", () => {
    expect(() => getAgentRunConfig("")).toThrow(/thread_id/);
    const cfg = getAgentRunConfig("thread-a");
    expect(cfg.configurable.thread_id).toBe("thread-a");
    expect(cfg.recursionLimit).toBe(40);
  });

  it("reads AGENT_RECURSION_LIMIT for stream/invoke options", () => {
    process.env.AGENT_RECURSION_LIMIT = "25";
    expect(getAgentRunConfig("t").recursionLimit).toBe(25);
  });
});

describe("resolveCheckpointer", () => {
  const prevMode = process.env.AGENT_CHECKPOINTER;
  const prevUrl = process.env.DATABASE_URL;

  afterEach(() => {
    resetCheckpointerSingletonsForTests();
    if (prevMode === undefined) delete process.env.AGENT_CHECKPOINTER;
    else process.env.AGENT_CHECKPOINTER = prevMode;
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
  });

  it("defaults to memory when DATABASE_URL missing (D-21 degrade)", async () => {
    delete process.env.AGENT_CHECKPOINTER;
    delete process.env.DATABASE_URL;
    const saver = await resolveCheckpointer();
    expect(saver).toBeInstanceOf(MemorySaver);
  });

  it("uses MemorySaver when AGENT_CHECKPOINTER=memory", async () => {
    process.env.AGENT_CHECKPOINTER = "memory";
    const saver = await resolveCheckpointer();
    expect(saver).toBeInstanceOf(MemorySaver);
  });

  it("honors options.checkpointer override", async () => {
    const injected = new MemorySaver();
    const saver = await resolveCheckpointer(injected);
    expect(saver).toBe(injected);
  });

  it("ensureCheckpointerSetup is no-op without DATABASE_URL", async () => {
    delete process.env.AGENT_CHECKPOINTER;
    delete process.env.DATABASE_URL;
    await expect(ensureCheckpointerSetup()).resolves.toBeUndefined();
  });

  it("ensureCheckpointerSetup calls setup() once when postgres saver is ready", async () => {
    const { plantPostgresSaverForTests } = await import("./build-graph");
    process.env.AGENT_CHECKPOINTER = "postgres";
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/testdb";
    resetCheckpointerSingletonsForTests();

    const setup = vi.fn(async () => undefined);
    plantPostgresSaverForTests({ setup } as never);

    await ensureCheckpointerSetup();
    await ensureCheckpointerSetup();
    expect(setup).toHaveBeenCalledTimes(1);
  });
});

describe("buildAgentGraph", () => {
  afterEach(() => {
    resetCheckpointerSingletonsForTests();
  });

  it("compiles with a mock ChatModel (createSupervisor + checkpointer)", async () => {
    const graph = await buildAgentGraph({
      model: mockChatModel(),
      checkpointer: new MemorySaver(),
    });
    expect(graph).toBeTruthy();
    expect(typeof graph.invoke).toBe("function");
    expect(typeof graph.stream).toBe("function");
  });

  it("compiles with SqliteSaver when AGENT_CHECKPOINTER=sqlite", async () => {
    const prevMode = process.env.AGENT_CHECKPOINTER;
    const prevPath = process.env.AGENT_CHECKPOINTER_SQLITE_PATH;
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "agent-ckpt-"));
    process.env.AGENT_CHECKPOINTER = "sqlite";
    process.env.AGENT_CHECKPOINTER_SQLITE_PATH = join(dir, "t.sqlite");
    try {
      resetCheckpointerSingletonsForTests();
      const graph = await buildAgentGraph({ model: mockChatModel() });
      expect(graph).toBeTruthy();
      expect(typeof graph.stream).toBe("function");
    } finally {
      if (prevMode === undefined) delete process.env.AGENT_CHECKPOINTER;
      else process.env.AGENT_CHECKPOINTER = prevMode;
      if (prevPath === undefined) delete process.env.AGENT_CHECKPOINTER_SQLITE_PATH;
      else process.env.AGENT_CHECKPOINTER_SQLITE_PATH = prevPath;
      resetCheckpointerSingletonsForTests();
    }
  });

  it("short-circuits chitchat without entering supervisor workers", async () => {
    const graph = await buildAgentGraph({
      model: mockChatModel(),
      checkpointer: new MemorySaver(),
    });
    const run = getAgentRunConfig("chitchat-thread");
    const result = await graph.invoke({ messages: [new HumanMessage("你好")] }, run);
    const texts = (result.messages ?? []).map((m) =>
      typeof m.content === "string" ? m.content : "",
    );
    expect(texts.some((t) => /你好|助手|帮你/.test(t))).toBe(true);
    // 短路路径不应出现 tool / handoff 痕迹
    const hasToolish = (result.messages ?? []).some((m) => {
      const tc = (m as { tool_calls?: unknown[] }).tool_calls;
      return Array.isArray(tc) && tc.length > 0;
    });
    expect(hasToolish).toBe(false);
  });

  it("marks non-chitchat as supervisor route before subgraph invoke", () => {
    expect(resolveAgentRoute("对比三家供应商报价并输出结构化分析报告")).toBe("supervisor");
  });
});

describe("AgentState checkpoint channels (D-22)", () => {
  it("resumes messages + todos + citations for same thread_id after rebuild", async () => {
    const { END, START, StateGraph } = await import("@langchain/langgraph");
    const { AgentState } = await import("./state");
    const checkpointer = new MemorySaver();
    const threadId = "d22-resume-thread";

    const buildTiny = () =>
      new StateGraph(AgentState)
        .addNode("seed", (state) => ({
          messages: state.messages,
          todos: state.todos,
          citations: state.citations,
          workspaceId: state.workspaceId,
        }))
        .addEdge(START, "seed")
        .addEdge("seed", END)
        .compile({ checkpointer });

    const graph1 = buildTiny();
    await graph1.invoke(
      {
        messages: [new HumanMessage("记住这笔报销")],
        todos: [{ id: "t1", content: "查政策", status: "completed" as const }],
        citations: [
          {
            documentId: "doc-1",
            title: "差旅政策",
            similarity: 0.91,
            snippet: "需事先申请",
            source: "kb",
          },
        ],
        workspaceId: "ws-d22",
      },
      getAgentRunConfig(threadId),
    );

    // Simulate process restart: new compiled graph, same checkpointer + thread_id
    const graph2 = buildTiny();
    const snapped = await graph2.getState(getAgentRunConfig(threadId));
    const values = snapped.values as {
      messages?: { content?: unknown }[];
      todos?: { id: string }[];
      citations?: { documentId: string }[];
      workspaceId?: string;
    };
    expect(values.todos?.some((t) => t.id === "t1")).toBe(true);
    expect(values.citations?.some((c) => c.documentId === "doc-1")).toBe(true);
    expect(values.workspaceId).toBe("ws-d22");
    expect(values.messages?.length).toBeGreaterThan(0);
  });
});
