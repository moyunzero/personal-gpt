import { beforeEach, describe, expect, it, vi } from "vitest";

const generateRagHelperTextMock = vi.fn();

vi.mock("@personal-gpt/shared/ai/rag-helper", () => ({
  generateRagHelperText: (...args: unknown[]) => generateRagHelperTextMock(...args),
}));

import { rerankHitsWithLlm } from "./reranker";

describe("rerankHitsWithLlm", () => {
  beforeEach(() => {
    generateRagHelperTextMock.mockReset();
  });

  it("按 LLM 返回顺序重排", async () => {
    generateRagHelperTextMock.mockResolvedValue(JSON.stringify({ order: [1, 0] }));

    const hits = [
      { text: "A", similarity: 0.9, title: "t0" },
      { text: "B", similarity: 0.8, title: "t1" },
    ];

    const ranked = await rerankHitsWithLlm("问题", hits, 2);
    expect(ranked.map((h) => h.text)).toEqual(["B", "A"]);
  });

  it("LLM 失败时回退相似度排序", async () => {
    generateRagHelperTextMock.mockResolvedValue("invalid");

    const hits = [
      { text: "A", similarity: 0.7, title: "t0" },
      { text: "B", similarity: 0.9, title: "t1" },
    ];

    const ranked = await rerankHitsWithLlm("问题", hits, 1);
    expect(ranked[0].text).toBe("B");
  });
});
