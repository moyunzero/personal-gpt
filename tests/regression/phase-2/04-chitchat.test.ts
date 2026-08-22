/**
 * Phase 2 regression #4 — 闲聊不启全图（D-03 / D-17）。
 * 期望：Agent 模式下「今天天气怎么样」走图内轻量短路，不全量 Supervisor+Workers。
 * 禁止 live LLM。
 */
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAgentGraph,
  getAgentRunConfig,
  resetCheckpointerSingletonsForTests,
  resolveAgentRoute,
} from "../../../apps/agent-service/src/graph/build-graph";
import { isAgentChitchat } from "../../../apps/agent-service/src/graph/short-circuit";

describe("Phase 2 regression #4: chitchat skips full multi-agent graph (D-03/D-17)", () => {
  beforeEach(() => {
    process.env.AGENT_CHECKPOINTER = "memory";
    resetCheckpointerSingletonsForTests();
  });

  afterEach(() => {
    delete process.env.AGENT_CHECKPOINTER;
    resetCheckpointerSingletonsForTests();
  });

  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it("short-circuits 今天天气怎么样 without full Supervisor hub-and-spoke", async () => {
    expect(isAgentChitchat("今天天气怎么样")).toBe(true);
    expect(resolveAgentRoute("今天天气怎么样")).toBe("short");

    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });
    // compile 阶段 Supervisor 可能 bindTools；短路 invoke 不得 model.invoke
    const invokeSpy = vi.spyOn(model, "invoke");

    const graph = await buildAgentGraph({ model });
    const result = await graph.invoke(
      { messages: [new HumanMessage("今天天气怎么样")] },
      getAgentRunConfig("regression-04"),
    );

    expect(invokeSpy).not.toHaveBeenCalled();
    const last = result.messages?.at(-1);
    const content = typeof last?.content === "string" ? last.content : String(last?.content ?? "");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/闲聊|短路|调研|知识库|助手/);
  });

  it("does not invoke web_search or multi-worker tools on chitchat", async () => {
    expect(isAgentChitchat("今天天气怎么样")).toBe(true);
    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });
    const invokeSpy = vi.spyOn(model, "invoke");
    const graph = await buildAgentGraph({ model });
    await graph.invoke(
      { messages: [new HumanMessage("今天天气怎么样")] },
      getAgentRunConfig("regression-04b"),
    );
    // 短路节点不调用 LLM；Supervisor/worker 才会 model.invoke
    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
