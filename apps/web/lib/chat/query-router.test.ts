import { beforeEach, describe, expect, it, vi } from "vitest";

const generateRagHelperTextMock = vi.fn();
const probeKbRelevanceMock = vi.fn();

vi.mock("@personal-gpt/shared/ai/rag-helper", () => ({
  generateRagHelperText: (...args: unknown[]) => generateRagHelperTextMock(...args),
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

import { decideQueryRoute, shouldUseVectorSearch } from "./query-router";

describe("decideQueryRoute — 意图快路径", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
    probeKbRelevanceMock.mockReset();
  });

  it("寒暄 → direct，不调用预检/LLM", async () => {
    const decision = await decideQueryRoute("你好");
    expect(decision.route).toBe("direct");
    expect(decision.fastPath).toBe(true);
    expect(probeKbRelevanceMock).not.toHaveBeenCalled();
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("纯算式 → direct", async () => {
    const decision = await decideQueryRoute("1 + 2 = ?");
    expect(decision.route).toBe("direct");
    expect(decision.fastPath).toBe(true);
  });
});

describe("decideQueryRoute — embedding 预检", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
    probeKbRelevanceMock.mockReset();
  });

  it("高相似度 → retrieve，不调用 LLM", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.88,
      title: "奥德赛计划书",
      probed: true,
    });

    const decision = await decideQueryRoute("我的奥德赛计划书写的是什么？");
    expect(decision.route).toBe("retrieve");
    expect(decision.fastPath).toBe(true);
    expect(decision.precheckSimilarity).toBe(0.88);
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("低相似度 → direct，不调用 LLM", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.25,
      probed: true,
    });

    const decision = await decideQueryRoute("美团这家公司怎么样");
    expect(decision.route).toBe("direct");
    expect(decision.fastPath).toBe(true);
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });
});

describe("decideQueryRoute — embedding 灰色地带", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
    probeKbRelevanceMock.mockReset();
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.55,
      probed: true,
    });
  });

  it("灰色相似度 → retrieve，不调用 LLM（宁可多检）", async () => {
    const decision = await decideQueryRoute("某知名公司的商业模式");
    expect(decision.route).toBe("retrieve");
    expect(decision.fastPath).toBe(true);
    expect(decision.reason).toContain("gray_retrieve");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });

  it("奥德赛类问题 0.658 → gray_retrieve", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.658,
      probed: true,
    });

    const decision = await decideQueryRoute("奥德赛计划书给了什么建议");
    expect(decision.route).toBe("retrieve");
    expect(decision.reason).toBe("embedding_precheck:gray_retrieve:0.658");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });
});

describe("shouldUseVectorSearch（兼容层）", () => {
  it("寒暄不检索", () => {
    expect(shouldUseVectorSearch("你好")).toBe(false);
  });
});
