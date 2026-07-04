import { beforeEach, describe, expect, it, vi } from "vitest";

const probeKbRelevanceMock = vi.fn();
const generateRagHelperTextMock = vi.fn();

vi.mock("@/lib/chat/embedding-precheck", () => ({
  probeKbRelevance: (...args: unknown[]) => probeKbRelevanceMock(...args),
  precheckSuggestsRetrieve: (result: { probed: boolean; topSimilarity: number }) =>
    result.probed && result.topSimilarity >= 0.68,
  precheckSuggestsDirect: (result: { probed: boolean; topSimilarity: number }) =>
    result.probed && result.topSimilarity < 0.42,
}));

vi.mock("@personal-gpt/shared/ai/rag-helper", () => ({
  generateRagHelperText: (...args: unknown[]) => generateRagHelperTextMock(...args),
}));

import { decideQueryRoute } from "@/lib/chat/query-router";

describe("Phase 1 regression #6: general knowledge routes direct", () => {
  beforeEach(() => {
    probeKbRelevanceMock.mockReset();
    generateRagHelperTextMock.mockReset();
  });

  it("low embedding similarity → direct without retrieval", async () => {
    probeKbRelevanceMock.mockResolvedValue({
      topSimilarity: 0.2,
      probed: true,
    });

    const decision = await decideQueryRoute("美团这家公司怎么样");
    expect(decision.route).toBe("direct");
    expect(generateRagHelperTextMock).not.toHaveBeenCalled();
  });
});
