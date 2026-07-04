import { describe, expect, it } from "vitest";

import { precheckSuggestsDirect, precheckSuggestsRetrieve } from "./embedding-precheck";

describe("embedding-precheck thresholds", () => {
  it("高相似度 → retrieve", () => {
    expect(precheckSuggestsRetrieve({ topSimilarity: 0.85, probed: true })).toBe(true);
  });

  it("低相似度 → direct", () => {
    expect(precheckSuggestsDirect({ topSimilarity: 0.3, probed: true })).toBe(true);
  });

  it("灰色地带两者皆否", () => {
    const gray = { topSimilarity: 0.55, probed: true };
    expect(precheckSuggestsRetrieve(gray)).toBe(false);
    expect(precheckSuggestsDirect(gray)).toBe(false);
  });
});
