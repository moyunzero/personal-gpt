import { afterEach, describe, expect, it } from "vitest";

import { readIntentRouterConfig } from "./config";
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
