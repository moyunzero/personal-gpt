import { describe, expect, it } from "vitest";

import { graphRagQuery, resolveProductName } from "./graph-rag";
import { createSeededMilkTeaFixtureExecutor } from "./graph-rag";

describe("resolveProductName", () => {
  it("matches pearl milk tea entities only", () => {
    expect(resolveProductName("珍珠奶茶有哪些原料？")).toBe("珍珠奶茶");
    expect(resolveProductName("pearl milk tea recipe")).toBe("珍珠奶茶");
  });

  it("returns null for unrelated or broad milk-tea queries", () => {
    expect(resolveProductName("心理学有哪些内容？整理给我")).toBeNull();
    expect(resolveProductName("差旅报销政策")).toBeNull();
    expect(resolveProductName("奶茶用了什么工艺？")).toBeNull();
  });
});

describe("graphRagQuery", () => {
  it("returns NO_PATH when question has no seed entity", async () => {
    const result = await graphRagQuery({ question: "心理学有哪些内容？" });
    expect(result.paths).toHaveLength(0);
    expect(result.summary).toMatch(/NO_PATH/);
  });

  it("returns HIT for seed entity via fixture", async () => {
    const result = await graphRagQuery({
      question: "珍珠奶茶用了什么工艺？",
      executor: createSeededMilkTeaFixtureExecutor(),
    });
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/HIT/);
  });
});
