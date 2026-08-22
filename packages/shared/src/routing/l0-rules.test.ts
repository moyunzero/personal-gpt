import { describe, expect, it } from "vitest";

import {
  matchGraphRelationL0,
  matchL0Rules,
  orderSpecialistsByKeywordAppearance,
} from "./l0-rules";

describe("matchGraphRelationL0 (D-06 / H-04)", () => {
  it("「珍珠奶茶有哪些原料，用了什么工艺？」→ terminal graph_relation, graph_search only", () => {
    const q = "珍珠奶茶有哪些原料，用了什么工艺？";
    const hit = matchGraphRelationL0(q);
    expect(hit).not.toBeNull();
    expect(hit!.primary).toBe("graph_relation");
    expect(hit!.terminal).toBe(true);
    expect(hit!.retrieverTools).toEqual(["graph_search"]);
    expect(hit!.graphSignal).toBe(true);
  });

  it("matchL0Rules returns same H-04 hit", () => {
    const q = "珍珠奶茶有哪些原料，用了什么工艺？";
    const hit = matchL0Rules(q);
    expect(hit?.primary).toBe("graph_relation");
    expect(hit?.retrieverTools).toEqual(["graph_search"]);
  });

  it("「珍珠奶茶有哪些优惠」→ not graph_relation (WR-02)", () => {
    expect(matchGraphRelationL0("珍珠奶茶有哪些优惠活动")).toBeNull();
    expect(matchL0Rules("珍珠奶茶有哪些优惠活动")).toBeNull();
  });
});

describe("chitchat L0 (D-03)", () => {
  it("「你好」→ chitchat terminal, no tools", () => {
    const hit = matchL0Rules("你好");
    expect(hit?.primary).toBe("chitchat");
    expect(hit?.channels).toBe("none");
    expect(hit?.retrieverTools).toEqual([]);
    expect(hit?.terminal).toBe(true);
  });
});

describe("orderSpecialistsByKeywordAppearance (D-12)", () => {
  it("「先联网再写报告」→ researcher before editor by keyword index", () => {
    const order = orderSpecialistsByKeywordAppearance("先联网再写报告");
    expect(order.indexOf("researcher")).toBeLessThan(order.indexOf("editor"));
    expect(order).toContain("researcher");
    expect(order).toContain("editor");
  });

  it("multi-step with graph + kb respects keyword order", () => {
    const q = "先查知识库里的配方，再查图谱关系，最后写报告";
    const order = orderSpecialistsByKeywordAppearance(q);
    expect(order.length).toBeGreaterThanOrEqual(2);
    expect(order[0]).toBe("retriever");
  });
});
