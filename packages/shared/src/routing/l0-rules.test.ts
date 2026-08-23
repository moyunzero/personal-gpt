import { describe, expect, it } from "vitest";

import {
  isPureMathExpression,
  matchGraphRelationL0,
  matchL0Rules,
  orderSpecialistsByKeywordAppearance,
} from "./l0-rules";

describe("isPureMathExpression", () => {
  it("requires at least one digit", () => {
    expect(isPureMathExpression("?")).toBe(false);
    expect(isPureMathExpression("()")).toBe(false);
    expect(isPureMathExpression("1+1")).toBe(true);
  });
});

describe("matchGraphRelationL0 (D-06 / H-04)", () => {
  it("「珍珠奶茶有哪些原料，用了什么工艺？」→ terminal graph_relation, graph_search only", async () => {
    const q = "珍珠奶茶有哪些原料，用了什么工艺？";
    const hit = await matchGraphRelationL0(q);
    expect(hit).not.toBeNull();
    expect(hit!.primary).toBe("graph_relation");
    expect(hit!.terminal).toBe(true);
    expect(hit!.retrieverTools).toEqual(["graph_search"]);
    expect(hit!.graphSignal).toBe(true);
    expect(hit!.reason).toBe("l0:graph_relation:seed_entity");
  });

  it("matchL0Rules returns same H-04 hit", async () => {
    const q = "珍珠奶茶有哪些原料，用了什么工艺？";
    const hit = await matchL0Rules(q);
    expect(hit?.primary).toBe("graph_relation");
    expect(hit?.retrieverTools).toEqual(["graph_search"]);
  });

  it("「珍珠奶茶有哪些优惠」→ not graph_relation (WR-02)", async () => {
    expect(await matchGraphRelationL0("珍珠奶茶有哪些优惠活动")).toBeNull();
    expect(await matchL0Rules("珍珠奶茶有哪些优惠活动")).toBeNull();
  });
});

describe("chitchat L0 (D-03)", () => {
  it("「你好」→ chitchat terminal, no tools", async () => {
    const hit = await matchL0Rules("你好");
    expect(hit?.primary).toBe("chitchat");
    expect(hit?.channels).toBe("none");
    expect(hit?.retrieverTools).toEqual([]);
    expect(hit?.terminal).toBe(true);
  });
});

describe("orderSpecialistsByKeywordAppearance (D-12)", () => {
  it("「先联网再写报告」→ researcher before editor by keyword index", async () => {
    const order = await orderSpecialistsByKeywordAppearance("先联网再写报告");
    expect(order.indexOf("researcher")).toBeLessThan(order.indexOf("editor"));
    expect(order).toContain("researcher");
    expect(order).toContain("editor");
  });

  it("multi-step with graph + kb respects keyword order", async () => {
    const q = "先查知识库里的配方，再查图谱关系，最后写报告";
    const order = await orderSpecialistsByKeywordAppearance(q);
    expect(order.length).toBeGreaterThanOrEqual(2);
    expect(order[0]).toBe("retriever");
  });

  it("「在知识库搜索珍珠奶茶原料」→ not web researcher (WR-B-07)", async () => {
    const order = await orderSpecialistsByKeywordAppearance("在知识库搜索珍珠奶茶原料");
    expect(order).not.toContain("researcher");
  });

  it("「联网调研…再写报告」→ researcher (WR-B-07 web cues)", async () => {
    const order = await orderSpecialistsByKeywordAppearance("联网调研珍珠奶茶竞品再写报告");
    expect(order).toContain("researcher");
  });
});
