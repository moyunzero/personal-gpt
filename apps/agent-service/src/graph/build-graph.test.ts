/**
 * buildAgentGraph 单测：compile、闲聊短路、recursionLimit（无 live LLM）。
 */
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { afterEach, describe, expect, it } from "vitest";

import { buildAgentGraph, getAgentRunConfig, resolveAgentRoute } from "./build-graph";

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

describe("buildAgentGraph", () => {
  it("compiles with a mock ChatModel (createSupervisor + MemorySaver)", async () => {
    const graph = await buildAgentGraph({ model: mockChatModel() });
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
      const graph = await buildAgentGraph({ model: mockChatModel() });
      expect(graph).toBeTruthy();
      expect(typeof graph.stream).toBe("function");
    } finally {
      if (prevMode === undefined) delete process.env.AGENT_CHECKPOINTER;
      else process.env.AGENT_CHECKPOINTER = prevMode;
      if (prevPath === undefined) delete process.env.AGENT_CHECKPOINTER_SQLITE_PATH;
      else process.env.AGENT_CHECKPOINTER_SQLITE_PATH = prevPath;
    }
  });

  it("short-circuits chitchat without entering supervisor workers", async () => {
    const graph = await buildAgentGraph({ model: mockChatModel() });
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
