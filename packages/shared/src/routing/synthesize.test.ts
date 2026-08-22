import { afterEach, describe, expect, it } from "vitest";

import { readIntentRouterConfig } from "./config";
import { matchL0Rules } from "./l0-rules";
import { synthesizeIntentPlan } from "./synthesize";
import { IntentPlanSchema, PrimaryIntentSchema } from "./types";

const PRIMARY_INTENTS = [
  "chitchat",
  "general",
  "kb_doc",
  "graph_relation",
  "kb_graph_hybrid",
  "web_research",
  "analytics",
  "report",
  "multi_step",
] as const;

describe("IntentPlan schema (D-01/D-02)", () => {
  it("accepts all PrimaryIntent enum values from D-02", () => {
    for (const primary of PRIMARY_INTENTS) {
      expect(PrimaryIntentSchema.parse(primary)).toBe(primary);
      const plan = IntentPlanSchema.parse({
        primary,
        channels: primary === "chitchat" ? "none" : "kb",
        specialists: [],
        retrieverTools: [],
        fallbackChain: [],
        reason: "test",
        confidence: 0.5,
      });
      expect(plan.primary).toBe(primary);
    }
  });

  it("graph_relation plan retrieverTools is graph_search only (D-02/D-06)", () => {
    const plan = IntentPlanSchema.parse({
      primary: "graph_relation",
      channels: "graph",
      specialists: ["retriever"],
      retrieverTools: ["graph_search"],
      fallbackChain: ["kb_search"],
      reason: "l0:graph_relation",
      confidence: 0.95,
      graphSignal: true,
    });
    expect(plan.retrieverTools).toEqual(["graph_search"]);
  });

  it("includes optional graphSignal for D-13 fallback eligibility", () => {
    const withSignal = IntentPlanSchema.parse({
      primary: "kb_doc",
      channels: "kb",
      specialists: ["retriever"],
      retrieverTools: ["kb_search"],
      fallbackChain: ["graph_search"],
      reason: "l1:kb_high",
      confidence: 0.8,
      graphSignal: true,
    });
    expect(withSignal.graphSignal).toBe(true);

    const without = IntentPlanSchema.parse({
      primary: "kb_doc",
      channels: "kb",
      specialists: ["retriever"],
      retrieverTools: ["kb_search"],
      fallbackChain: [],
      reason: "l1:kb_high",
      confidence: 0.8,
    });
    expect(without.graphSignal).toBeUndefined();
  });
});

describe("readIntentRouterConfig (D-10/D-14)", () => {
  const envKeys = [
    "ENABLE_INTENT_ROUTER",
    "ENABLE_KB_GRAPH_FALLBACK",
    "ENABLE_L2_INTENT_CLASSIFIER",
  ] as const;

  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults ENABLE_INTENT_ROUTER=true, ENABLE_KB_GRAPH_FALLBACK=true, ENABLE_L2=false (D-14)", () => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const cfg = readIntentRouterConfig();
    expect(cfg.enableIntentRouter).toBe(true);
    expect(cfg.enableKbGraphFallback).toBe(true);
    expect(cfg.enableL2IntentClassifier).toBe(false);
  });

  it("L2 requires explicit ENABLE_L2_INTENT_CLASSIFIER=true — not synced to LLM router", () => {
    saved.ENABLE_L2_INTENT_CLASSIFIER = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    process.env.ENABLE_L2_INTENT_CLASSIFIER = "true";
    expect(readIntentRouterConfig().enableL2IntentClassifier).toBe(true);
  });
});

describe("synthesizeIntentPlan (D-03/D-13/D-10)", () => {
  it("L0 terminal graph hit skips L1 kb_doc override (D-03 / Pitfall 3)", () => {
    const l0 = matchL0Rules("珍珠奶茶有哪些原料，用了什么工艺？")!;
    const plan = synthesizeIntentPlan({
      query: "珍珠奶茶有哪些原料，用了什么工艺？",
      l0,
      l1: {
        kbHigh: true,
        kb: { probed: true, topSimilarity: 0.95, title: "seed doc" },
        reason: "l1:kb_high:0.950",
      },
      neo4jOk: true,
    });
    expect(plan.primary).toBe("graph_relation");
    expect(plan.retrieverTools).toEqual(["graph_search"]);
  });

  it("neo4jOk=false degrades graph_relation to kb_doc (D-10)", () => {
    const l0 = matchL0Rules("珍珠奶茶有哪些原料，用了什么工艺？")!;
    const plan = synthesizeIntentPlan({
      query: "珍珠奶茶有哪些原料，用了什么工艺？",
      l0,
      neo4jOk: false,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.reason).toContain("neo4j_unavailable");
    expect(plan.retrieverTools).toEqual(["kb_search"]);
  });

  it("kb_doc with graphSignal true → fallbackChain includes graph_search (D-13)", () => {
    const plan = synthesizeIntentPlan({
      query: "奶茶工艺",
      l1: {
        kbHigh: true,
        graphSignal: true,
        kb: { probed: true, topSimilarity: 0.9 },
        reason: "l1:kb_high",
      },
      neo4jOk: true,
    });
    expect(plan.primary).toBe("kb_graph_hybrid");
    expect(plan.retrieverTools).toEqual(["kb_search", "graph_search"]);
    expect(plan.fallbackChain).toContain("graph_search");
    expect(plan.graphSignal).toBe(true);
  });

  it("mixed graph+KB L0 non-terminal → kb_graph_hybrid with both retriever tools (CR-X-01)", () => {
    const l0 = matchL0Rules("珍珠奶茶原料知识库里怎么写的")!;
    expect(l0?.terminal).toBe(false);
    const plan = synthesizeIntentPlan({
      query: "珍珠奶茶原料知识库里怎么写的",
      l0,
      l1: {
        kbHigh: true,
        graphSignal: true,
        kb: { probed: true, topSimilarity: 0.9, title: "珍珠奶茶" },
        reason: "l1:kb_high:0.900",
      },
      neo4jOk: true,
    });
    expect(plan.primary).toBe("kb_graph_hybrid");
    expect(plan.retrieverTools).toContain("kb_search");
    expect(plan.retrieverTools).toContain("graph_search");
  });

  it("kb_doc without graph signals → no unconditional graph fallback (D-13)", () => {
    const plan = synthesizeIntentPlan({
      query: "奥德赛计划书建议",
      l1: {
        kbHigh: true,
        graphSignal: false,
        kb: { probed: true, topSimilarity: 0.9 },
        reason: "l1:kb_high",
      },
      neo4jOk: true,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.fallbackChain).not.toContain("graph_search");
  });

  it("L2 primary wins → preserves L2 reason over L1 (kb_gray / retrieve_safe)", () => {
    const plan = synthesizeIntentPlan({
      query: "模糊问题",
      l1: {
        kbGray: true,
        kb: { probed: true, topSimilarity: 0.55 },
        reason: "l1:kb_gray:0.550",
      },
      l2Hint: {
        primary: "kb_doc",
        reason: "l2:kb_gray;retrieve_safe",
        confidence: 0.75,
      },
      neo4jOk: true,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.reason).toBe("l2:kb_gray;retrieve_safe");
  });
});
