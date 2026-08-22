import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateRagHelperTextMock = vi.fn();
const probeKbRelevanceMock = vi.fn();
const getNeo4jDriverFromEnvMock = vi.fn();

vi.mock("@personal-gpt/shared/ai/rag-helper", () => ({
  generateRagHelperText: (...args: unknown[]) => generateRagHelperTextMock(...args),
}));

vi.mock("@personal-gpt/shared", () => ({
  getNeo4jDriverFromEnv: (...args: unknown[]) => getNeo4jDriverFromEnvMock(...args),
}));

vi.mock("./embedding-precheck", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embedding-precheck")>();
  return {
    ...actual,
    probeKbRelevance: (...args: unknown[]) => probeKbRelevanceMock(...args),
  };
});

vi.mock("./rag-options", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rag-options")>();
  return {
    ...actual,
    ENABLE_LLM_QUERY_ROUTER: true,
    ENABLE_EMBEDDING_ROUTE_PRECHECK: true,
  };
});

import {
  decideQueryRoute,
  resetNeo4jAvailabilityCacheForTests,
  shouldUseVectorSearch,
} from "./query-router";

describe("decideQueryRoute — shared intent router (D-01/D-16)", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
    probeKbRelevanceMock.mockReset();
    getNeo4jDriverFromEnvMock.mockReset();
    resetNeo4jAvailabilityCacheForTests();
    process.env.ENABLE_INTENT_ROUTER = "true";
    getNeo4jDriverFromEnvMock.mockReturnValue({
      verifyConnectivity: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    delete process.env.ENABLE_INTENT_ROUTER;
    resetNeo4jAvailabilityCacheForTests();
  });

  it("寒暄 → direct via shared L0 (D-03)", async () => {
    const decision = await decideQueryRoute("你好");
    expect(decision.route).toBe("direct");
    expect(decision.intentPrimary).toBe("chitchat");
    expect(probeKbRelevanceMock).not.toHaveBeenCalled();
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("高相似度 probeKb → retrieve kb_doc (D-07)", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.88,
      title: "奥德赛计划书",
      probed: true,
    });

    const decision = await decideQueryRoute("我的奥德赛计划书写的是什么？");
    expect(decision.route).toBe("retrieve");
    expect(decision.intentPrimary).toBe("kb_doc");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("灰色地带 probe → retrieve not direct per D-16", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.55,
      probed: true,
    });

    const decision = await decideQueryRoute("某知名公司的商业模式");
    expect(decision.route).toBe("retrieve");
    expect(decision.intentPrimary).toBe("kb_doc");
    expect(decision.reason).toContain("kb_gray");
  });

  it("H-04 pearl milk tea → direct + needsGraphContext (D-06/D-07)", async () => {
    const decision = await decideQueryRoute("珍珠奶茶有哪些原料，用了什么工艺？");
    expect(decision.route).toBe("direct");
    expect(decision.needsGraphContext).toBe(true);
    expect(decision.graphContextType).toBe("graph_relation");
    expect(decision.intentPrimary).toBe("graph_relation");
    expect(probeKbRelevanceMock).not.toHaveBeenCalled();
  });

  it("Neo4j unavailable → degrade kb_doc retrieve without throw (D-10)", async () => {
    resetNeo4jAvailabilityCacheForTests();
    getNeo4jDriverFromEnvMock.mockReturnValue({
      verifyConnectivity: vi.fn().mockRejectedValue(new Error("neo4j down")),
    });

    const decision = await decideQueryRoute("珍珠奶茶有哪些原料，用了什么工艺？");
    expect(decision.route).toBe("retrieve");
    expect(decision.intentPrimary).toBe("kb_doc");
    expect(decision.needsGraphContext).toBeUndefined();
  });

  it("ENABLE_INTENT_ROUTER=false uses legacy embedding precheck (D-10)", async () => {
    process.env.ENABLE_INTENT_ROUTER = "false";
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.25,
      probed: true,
    });

    const decision = await decideQueryRoute("美团这家公司怎么样");
    expect(decision.route).toBe("direct");
    expect(decision.reason).toContain("embedding_precheck:low_sim");
    expect(decision.intentPrimary).toBeUndefined();
  });
});

describe("decideQueryRoute — legacy embedding 预检 (shared router on)", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
    probeKbRelevanceMock.mockReset();
    getNeo4jDriverFromEnvMock.mockReset();
    resetNeo4jAvailabilityCacheForTests();
    process.env.ENABLE_INTENT_ROUTER = "true";
    getNeo4jDriverFromEnvMock.mockReturnValue({
      verifyConnectivity: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("低相似度 → direct", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.25,
      probed: true,
    });

    const decision = await decideQueryRoute("美团这家公司怎么样");
    expect(decision.route).toBe("direct");
    expect(decision.intentPrimary).toBe("general");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("奥德赛类问题 0.658 → gray retrieve (D-16)", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.658,
      probed: true,
    });

    const decision = await decideQueryRoute("奥德赛计划书给了什么建议");
    expect(decision.route).toBe("retrieve");
    expect(decision.reason).toContain("kb_gray");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });
});

describe("shouldUseVectorSearch（兼容层）", () => {
  it("寒暄不检索", () => {
    expect(shouldUseVectorSearch("你好")).toBe(false);
  });
});
