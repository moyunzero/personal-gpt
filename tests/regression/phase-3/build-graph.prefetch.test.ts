import { HumanMessage } from "@langchain/core/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPrefetchNode } from "../../../apps/agent-service/src/graph/build-graph";
import type { IntentPlan } from "@personal-gpt/shared/routing";

const invokeGraphSearchMock = vi.fn();
const invokeKbSearchMock = vi.fn();

vi.mock("../../../apps/agent-service/src/tools/graph-search.tool", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/agent-service/src/tools/graph-search.tool")>();
  return {
    ...actual,
    invokeGraphSearch: (...args: unknown[]) => invokeGraphSearchMock(...args),
  };
});

vi.mock("../../../apps/agent-service/src/tools/kb-search.tool", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/agent-service/src/tools/kb-search.tool")>();
  return {
    ...actual,
    invokeKbSearch: (...args: unknown[]) => invokeKbSearchMock(...args),
  };
});

const GRAPH_ONLY_PLAN: IntentPlan = {
  primary: "graph_relation",
  channels: "graph",
  retrieverTools: ["graph_search"],
  fallbackChain: ["kb_search"],
  specialists: ["retriever"],
  graphSignal: true,
  reason: "test",
  confidence: 1,
};

const KB_GRAPH_FALLBACK_PLAN: IntentPlan = {
  primary: "kb_doc",
  channels: "kb",
  retrieverTools: ["kb_search"],
  fallbackChain: ["graph_search"],
  specialists: ["retriever"],
  graphSignal: true,
  reason: "test",
  confidence: 1,
};

describe("buildPrefetchNode tool invocation", () => {
  beforeEach(() => {
    invokeGraphSearchMock.mockReset();
    invokeKbSearchMock.mockReset();
    process.env.ENABLE_KB_GRAPH_FALLBACK = "true";
  });

  afterEach(() => {
    delete process.env.ENABLE_KB_GRAPH_FALLBACK;
  });

  it("invokes graph_search for graph-only plans", async () => {
    invokeGraphSearchMock.mockResolvedValue("GRAPH_SEARCH_STATUS: HIT\npath");
    const node = buildPrefetchNode(GRAPH_ONLY_PLAN);
    const result = await node(
      { messages: [new HumanMessage("珍珠奶茶有哪些原料？")] },
      { configurable: { workspaceId: "default" } },
    );
    expect(invokeGraphSearchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("messages");
  });

  it("invokes graph_search after KB miss when fallback enabled", async () => {
    invokeKbSearchMock.mockResolvedValue("KB_SEARCH_STATUS: NO_RELEVANT_HIT");
    invokeGraphSearchMock.mockResolvedValue("GRAPH_SEARCH_STATUS: HIT\ngraph path");
    const node = buildPrefetchNode(KB_GRAPH_FALLBACK_PLAN);
    await node(
      { messages: [new HumanMessage("差旅报销政策有哪些条款？")] },
      { configurable: { workspaceId: "default" } },
    );
    expect(invokeKbSearchMock).toHaveBeenCalledTimes(1);
    expect(invokeGraphSearchMock).toHaveBeenCalledTimes(1);
  });

  it("treats rejected graph_search as empty prefetch output", async () => {
    invokeGraphSearchMock.mockRejectedValue(new Error("neo4j down"));
    const node = buildPrefetchNode(GRAPH_ONLY_PLAN);
    const result = await node(
      { messages: [new HumanMessage("珍珠奶茶有哪些原料？")] },
      { configurable: { workspaceId: "default" } },
    );
    expect(result).toEqual({});
  });
});
