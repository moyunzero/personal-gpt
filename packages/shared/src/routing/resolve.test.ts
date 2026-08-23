import { afterEach, describe, expect, it, vi } from "vitest";

import { mapIntentPlanToChatRoute, isPlanAmbiguous } from "./chat-map";
import { readIntentRouterConfig } from "./config";
import { resolveIntentPlan } from "./resolve";
import { synthesizeIntentPlan } from "./synthesize";

describe("resolveIntentPlan", () => {
  const envSaved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(envSaved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it("mock probeKb high sim → primary kb_doc, layers includes L1 (D-03)", async () => {
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.9,
      title: "doc",
    });
    const { plan, layers, precheckSimilarity } = await resolveIntentPlan("奥德赛计划书建议", {
      probeKb,
    });
    expect(layers).toContain("L1");
    expect(plan.primary).toBe("kb_doc");
    expect(precheckSimilarity).toBe(0.9);
    expect(probeKb).toHaveBeenCalled();
  });

  it("H-04 query → layers [L0] only — L1 skipped on terminal L0 (D-06)", async () => {
    const probeKb = vi.fn();
    const { plan, layers } = await resolveIntentPlan("珍珠奶茶有哪些原料，用了什么工艺？", {
      probeKb,
    });
    expect(layers).toEqual(["L0"]);
    expect(plan.primary).toBe("graph_relation");
    expect(probeKb).not.toHaveBeenCalled();
  });

  it("ENABLE_L2 false (default) → no L2 layer on gray input (D-14)", async () => {
    envSaved.ENABLE_L2_INTENT_CLASSIFIER = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    delete process.env.ENABLE_L2_INTENT_CLASSIFIER;

    const classifyL2 = vi.fn().mockResolvedValue({ primary: "kb_doc" as const });
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.55,
    });
    const { layers } = await resolveIntentPlan("模糊问题", { probeKb, classifyL2 });
    expect(layers).not.toContain("L2");
    expect(classifyL2).not.toHaveBeenCalled();
  });

  it("ENABLE_L2 true + gray input → L2 may add layer (D-14 opt-in)", async () => {
    envSaved.ENABLE_L2_INTENT_CLASSIFIER = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    process.env.ENABLE_L2_INTENT_CLASSIFIER = "true";

    const classifyL2 = vi.fn().mockResolvedValue({
      primary: "kb_doc" as const,
      confidence: 0.75,
      reason: "l2:kb",
    });
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.55,
    });
    const { layers, plan } = await resolveIntentPlan("模糊问题", { probeKb, classifyL2 });
    expect(layers).toContain("L2");
    expect(classifyL2).toHaveBeenCalled();
    expect(plan.primary).toBe("kb_doc");
  });

  it("classifyL2 failure returns null; resolve succeeds via L3 (D-03)", async () => {
    envSaved.ENABLE_L2_INTENT_CLASSIFIER = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    process.env.ENABLE_L2_INTENT_CLASSIFIER = "true";

    const classifyL2 = vi.fn().mockResolvedValue(null);
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.55,
    });
    const { plan, layers } = await resolveIntentPlan("灰色问题", { probeKb, classifyL2 });
    expect(layers).not.toContain("L2");
    expect(plan.primary).toBeDefined();
  });

  it("classifyL2 rejection is fail-open; resolve succeeds via L3", async () => {
    envSaved.ENABLE_L2_INTENT_CLASSIFIER = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    process.env.ENABLE_L2_INTENT_CLASSIFIER = "true";

    const classifyL2 = vi.fn().mockRejectedValue(new Error("l2 down"));
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.55,
    });
    const { plan, layers } = await resolveIntentPlan("灰色问题", { probeKb, classifyL2 });
    expect(layers).not.toContain("L2");
    expect(plan.primary).toBeDefined();
  });

  it("probeKb rejection is fail-open with kb_unprobed", async () => {
    const probeKb = vi.fn().mockRejectedValue(new Error("kb probe down"));
    const { plan, layers, precheckSimilarity } = await resolveIntentPlan("奥德赛计划书建议", {
      probeKb,
    });
    expect(layers).toContain("L1");
    expect(plan.primary).toBeDefined();
    expect(precheckSimilarity).toBeUndefined();
  });

  it("mixed graph+KB query → kb_graph_hybrid with both retriever tools (CR-X-01)", async () => {
    const probeKb = vi.fn().mockResolvedValue({
      probed: true,
      topSimilarity: 0.9,
      title: "珍珠奶茶",
    });
    const { plan, layers } = await resolveIntentPlan("珍珠奶茶原料知识库里怎么写的", {
      probeKb,
      neo4jAvailable: () => true,
    });
    expect(layers).toContain("L0");
    expect(layers).toContain("L1");
    expect(plan.primary).toBe("kb_graph_hybrid");
    expect(plan.retrieverTools).toContain("kb_search");
    expect(plan.retrieverTools).toContain("graph_search");
  });

  it("心理学 content query → kb_doc retriever (not graph default)", async () => {
    const { plan } = await resolveIntentPlan("心理学有哪些内容？整理给我", {
      neo4jAvailable: () => true,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.specialists).toEqual(["retriever"]);
    expect(plan.retrieverTools).toEqual(["kb_search"]);
    expect(plan.ambiguous).not.toBe(true);
  });

  it("企业知识库 content listing → kb_doc (corpus-agnostic, not psychology-only)", async () => {
    const { plan } = await resolveIntentPlan("企业知识库有哪些文档？整理给我", {
      neo4jAvailable: () => true,
    });
    expect(plan.primary).toBe("kb_doc");
    expect(plan.retrieverTools).toEqual(["kb_search"]);
  });
});

describe("mapIntentPlanToChatRoute (D-07/D-16)", () => {
  it("chitchat/general → direct", () => {
    expect(
      mapIntentPlanToChatRoute({
        primary: "chitchat",
        channels: "none",
        specialists: [],
        retrieverTools: [],
        fallbackChain: [],
        reason: "l0:greeting",
        confidence: 0.95,
      }).route,
    ).toBe("direct");

    expect(
      mapIntentPlanToChatRoute({
        primary: "general",
        channels: "none",
        specialists: [],
        retrieverTools: [],
        fallbackChain: [],
        reason: "l1:kb_low",
        confidence: 0.7,
      }).route,
    ).toBe("direct");
  });

  it("kb_doc → retrieve", () => {
    expect(
      mapIntentPlanToChatRoute({
        primary: "kb_doc",
        channels: "kb",
        specialists: ["retriever"],
        retrieverTools: ["kb_search"],
        fallbackChain: [],
        reason: "l1:kb_high",
        confidence: 0.85,
      }).route,
    ).toBe("retrieve");
  });

  it("graph_relation → retrieve with needsGraphContext (D-07)", () => {
    const decision = mapIntentPlanToChatRoute({
      primary: "graph_relation",
      channels: "graph",
      specialists: ["retriever"],
      retrieverTools: ["graph_search"],
      fallbackChain: ["kb_search"],
      reason: "l0:graph_relation",
      confidence: 0.95,
      graphSignal: true,
    });
    expect(decision.route).toBe("retrieve");
    expect(decision.needsGraphContext).toBe(true);
    expect(decision.graphContextType).toBe("graph_relation");
  });

  it("L1 gray zone → Chat route retrieve per D-16 retrieve_safe", () => {
    const decision = mapIntentPlanToChatRoute({
      primary: "kb_doc",
      channels: "kb",
      specialists: ["retriever"],
      retrieverTools: ["kb_search"],
      fallbackChain: [],
      reason: "l1:kb_gray:0.550;retrieve_safe",
      confidence: 0.65,
    });
    expect(decision.route).toBe("retrieve");
  });
});

describe("isPlanAmbiguous (D-16 Agent)", () => {
  it("marks ambiguous true only when plan.ambiguous set", () => {
    expect(
      isPlanAmbiguous(
        synthesizeIntentPlan({
          query: "maybe",
          l1: { kb: { probed: false, topSimilarity: 0 }, reason: "l1:no_probe" },
        }),
      ),
    ).toBe(true);

    expect(
      isPlanAmbiguous({
        primary: "kb_doc",
        channels: "kb",
        specialists: ["retriever"],
        retrieverTools: ["kb_search"],
        fallbackChain: [],
        reason: "l1:kb_high",
        confidence: 0.9,
        ambiguous: false,
      }),
    ).toBe(false);
  });
});

describe("readIntentRouterConfig L2 default", () => {
  it("L2 default false when env unset (D-14)", () => {
    const saved = process.env.ENABLE_L2_INTENT_CLASSIFIER;
    delete process.env.ENABLE_L2_INTENT_CLASSIFIER;
    expect(readIntentRouterConfig().enableL2IntentClassifier).toBe(false);
    if (saved === undefined) delete process.env.ENABLE_L2_INTENT_CLASSIFIER;
    else process.env.ENABLE_L2_INTENT_CLASSIFIER = saved;
  });
});
