/**
 * Phase 3.1 regression #7 — Intent routing (ROUTE-01/02, AGENT-01, RAG-06, D-09).
 *
 * Case IDs:
 *   C1  H-04 pearl milk tea → graph_relation + graph_search tools
 *   C2  Agent stream → invokeGraphSearch + GRAPH_SEARCH_STATUS: HIT
 *   C3  chitchat → short route
 *   C4  general knowledge → Chat direct (P1 #06)
 *   C5  high KB Odyssey → kb_doc + kb_search
 *   C6  multi-step report → ≥2 specialists, keyword order
 *   C7  KB miss + graphSignal → invokeGraphSearch (D-13)
 *   C8  KB miss without graph signal → no invokeGraphSearch (D-13)
 *   C9  neo4j unavailable → degrade kb_doc, no throw (D-10)
 *   C10 single_specialist prefetch wiring (D-11/D-16)
 *   C11 ENABLE_INTENT_ROUTER=false legacy (D-10)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveIntentPlan, mapIntentPlanToChatRoute } from "@personal-gpt/shared/routing";

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

vi.mock("../../../apps/agent-service/src/routing/intent-plan", () => ({
  resolveIntentPlanForAgent: (...args: unknown[]) => resolveIntentPlanForAgentMock(...args),
  probeNeo4jAvailable: vi.fn(async () => true),
  resetNeo4jAvailabilityCacheForTests: vi.fn(),
}));

vi.mock("../../../apps/agent-service/src/graph/build-graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/agent-service/src/graph/build-graph")>();
  return {
    ...actual,
    buildAgentGraph: (...args: unknown[]) => buildAgentGraphMock(...args),
    buildSupervisorGraph: (...args: unknown[]) => buildSupervisorGraphMock(...args),
    buildExecutionGraph: (...args: unknown[]) => buildExecutionGraphMock(...args),
  };
});

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

vi.mock("../../../apps/agent-service/src/tools/kb-search.tool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/agent-service/src/tools/kb-search.tool")>();
  return {
    ...actual,
    invokeKbSearch: (...args: unknown[]) => invokeKbSearchMock(...args),
  };
});

vi.mock("../../../apps/agent-service/src/tools/graph-search.tool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/agent-service/src/tools/graph-search.tool")>();
  return {
    ...actual,
    invokeGraphSearch: (...args: unknown[]) => invokeGraphSearchMock(...args),
  };
});

const PEARL_QUERY = "珍珠奶茶有哪些原料，用了什么工艺？";

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

function setupAgentStreamMocks() {
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.ENABLE_INTENT_ROUTER = "true";

  resolveIntentPlanForAgentMock.mockResolvedValue({
    plan: GRAPH_PLAN,
    layers: ["L0"],
  });
  invokeGraphSearchMock.mockResolvedValue(
    "GRAPH_SEARCH_STATUS: HIT\n珍珠奶茶 path summary",
  );
  invokeKbSearchMock.mockResolvedValue(
    ["KB_SEARCH_STATUS: NO_RELEVANT_HIT", "No relevant knowledge base hits."].join("\n"),
  );

  toBaseMessagesMock.mockResolvedValue([{ content: PEARL_QUERY }]);
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
}

describe("Phase 3 regression #7: intent routing (H-04 pearl milk tea)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_INTENT_ROUTER;
    delete process.env.ENABLE_L2_INTENT_CLASSIFIER;
  });

  it("C1: H-04 pearl milk tea → graph_relation + retrieverTools graph_search (D-06)", async () => {
    const probeKb = vi.fn();
    const { plan } = await resolveIntentPlan(PEARL_QUERY, { probeKb });
    expect(plan.primary).toBe("graph_relation");
    expect(plan.retrieverTools).toEqual(["graph_search"]);
    expect(probeKb).not.toHaveBeenCalled();
  });

  it("C2: Agent stream invokes graph_search with GRAPH_SEARCH_STATUS: HIT (D-06, ROADMAP SC #1)", async () => {
    setupAgentStreamMocks();
    const { AgentService } = await import("../../../apps/agent-service/src/agent/agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "c2",
            role: "user",
            parts: [{ type: "text", text: PEARL_QUERY }],
          },
        ],
        thread_id: "t-07-c2",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __writes?: unknown[];
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;

    expect(invokeGraphSearchMock).toHaveBeenCalled();
    const graphOut = await invokeGraphSearchMock.mock.results[0]?.value;
    expect(String(graphOut)).toContain("GRAPH_SEARCH_STATUS: HIT");

    const tracePart = streamArg?.__writes?.find(
      (w) => (w as { type?: string }).type === "data-agent-trace",
    ) as Record<string, unknown> | undefined;
    const traceData = tracePart?.data as {
      events?: Array<{ name?: string; output?: string }>;
    };
    const graphEvents = traceData?.events?.filter((e) => e.name === "graph_search");
    expect(graphEvents?.length).toBeGreaterThan(0);
  });

  it("C3: 你好 → chitchat + Agent short route (D-04)", async () => {
    const { plan } = await resolveIntentPlan("你好");
    expect(plan.primary).toBe("chitchat");

    const { resolveExecutionMode } = await import(
      "../../../apps/agent-service/src/graph/build-graph"
    );
    expect(resolveExecutionMode(plan)).toBe("short");
  });

  it("C4: 美团这家公司怎么样 low KB → Chat direct (P1 #06, D-16 general exception)", async () => {
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.2,
    });
    const { plan } = await resolveIntentPlan("美团这家公司怎么样", { probeKb });
    expect(plan.primary).toBe("general");
    const chatRoute = mapIntentPlanToChatRoute(plan);
    expect(chatRoute.route).toBe("direct");
  });

  it("C5: high KB Odyssey → kb_doc + kb_search (D-07)", async () => {
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.9,
      title: "奥德赛计划书",
    });
    const { plan } = await resolveIntentPlan("奥德赛计划书给了什么建议", { probeKb });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.retrieverTools).toEqual(["kb_search"]);
  });

  it("C6: multi-step 报告 → specialists.length >= 2 with keyword order (D-12)", async () => {
    const { plan } = await resolveIntentPlan(
      "先检索知识库对比 LangGraph 与 AutoGen，再联网调研并写报告",
    );
    expect(plan.primary).toBe("multi_step");
    expect(plan.specialists.length).toBeGreaterThanOrEqual(2);
    const retrieverIdx = plan.specialists.indexOf("retriever");
    const researcherIdx = plan.specialists.indexOf("researcher");
    const editorIdx = plan.specialists.indexOf("editor");
    expect(retrieverIdx).toBeGreaterThanOrEqual(0);
    expect(researcherIdx).toBeGreaterThan(retrieverIdx);
    expect(editorIdx).toBeGreaterThan(researcherIdx);
  });

  it("C7: KB NO_RELEVANT_HIT + graphSignal → invokeGraphSearch (D-13)", async () => {
    setupAgentStreamMocks();
    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: KB_PLAN_WITH_GRAPH_FALLBACK,
      layers: ["L1"],
    });
    toBaseMessagesMock.mockResolvedValue([{ content: "差旅报销政策有哪些条款？" }]);

    const { AgentService } = await import("../../../apps/agent-service/src/agent/agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "c7",
            role: "user",
            parts: [{ type: "text", text: "差旅报销政策有哪些条款？" }],
          },
        ],
        thread_id: "t-07-c7",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(invokeKbSearchMock).toHaveBeenCalled();
    expect(invokeGraphSearchMock).toHaveBeenCalled();
  });

  it("C8: KB NO_RELEVANT_HIT without graphSignal → invokeGraphSearch NOT called (D-13)", async () => {
    setupAgentStreamMocks();
    resolveIntentPlanForAgentMock.mockResolvedValue({
      plan: KB_PLAN_NO_GRAPH,
      layers: ["L1"],
    });
    invokeGraphSearchMock.mockClear();
    toBaseMessagesMock.mockResolvedValue([{ content: "差旅报销政策有哪些条款？" }]);

    const { AgentService } = await import("../../../apps/agent-service/src/agent/agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "c8",
            role: "user",
            parts: [{ type: "text", text: "差旅报销政策有哪些条款？" }],
          },
        ],
        thread_id: "t-07-c8",
      },
      res,
    );
    const streamArg = createUIMessageStreamMock.mock.results.at(-1)?.value as {
      __ready?: Promise<void>;
    };
    await streamArg?.__ready;
    expect(invokeGraphSearchMock).not.toHaveBeenCalled();
  });

  it("C9: neo4j unavailable → degrade kb_doc without throw (D-10)", async () => {
    const probeKb = vi.fn();
    const { plan } = await resolveIntentPlan(PEARL_QUERY, {
      probeKb,
      neo4jAvailable: () => false,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.retrieverTools).toEqual(["kb_search"]);
    expect(plan.reason).toContain("neo4j_unavailable");
  });

  it("C10: single_specialist prefetch node before retriever (D-11/D-16)", async () => {
    const { createSingleSpecialistWorkflow, SINGLE_SPECIALIST_PREFETCH_NODE } = await import(
      "../../../apps/agent-service/src/graph/build-graph"
    );
    const { ChatOpenAI } = await import("@langchain/openai");
    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });
    const wf = createSingleSpecialistWorkflow(model, GRAPH_PLAN, "retriever");
    const nodes = (wf as { nodes?: Record<string, unknown> }).nodes ?? {};
    expect(Object.keys(nodes)).toContain(SINGLE_SPECIALIST_PREFETCH_NODE);
    expect(Object.keys(nodes)).toContain("retriever");
    expect(Object.keys(nodes)).not.toContain("supervisor");
  });

  it("C11: ENABLE_INTENT_ROUTER=false uses legacy buildSupervisorGraph (D-10)", async () => {
    setupAgentStreamMocks();
    process.env.ENABLE_INTENT_ROUTER = "false";
    toBaseMessagesMock.mockResolvedValue([{ content: "对比 LangGraph 与 AutoGen 并写报告" }]);

    const { AgentService } = await import("../../../apps/agent-service/src/agent/agent.service");
    const service = new AgentService();
    const res = { statusCode: 200, once: vi.fn() } as unknown as import("express").Response;
    await service.streamChat(
      {
        messages: [
          {
            id: "c11",
            role: "user",
            parts: [{ type: "text", text: "对比 LangGraph 与 AutoGen 并写报告" }],
          },
        ],
        thread_id: "t-07-c11",
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
});
