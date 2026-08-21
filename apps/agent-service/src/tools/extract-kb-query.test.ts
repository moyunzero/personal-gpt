/**
 * extractKbSearchQuery 单测。
 */
import { describe, expect, it } from "vitest";

import { extractKbSearchQuery } from "./extract-kb-query";

describe("extractKbSearchQuery", () => {
  it("compresses long agent task prompt to entity keywords", () => {
    const q = extractKbSearchQuery(
      "先查知识库里关于韶音手册的资料，再整理成一份简短 Markdown 报告",
    );
    expect(q).toMatch(/韶音手册/);
    expect(q).not.toMatch(/先查知识库/);
    expect(q).not.toMatch(/Markdown/);
    expect(q.length).toBeLessThan(40);
  });

  it("keeps protocol-style identifiers", () => {
    const q = extractKbSearchQuery("请检索知识库中蓝莓河豚协议 ZX-7749 的生效条件");
    expect(q).toMatch(/ZX-7749|蓝莓河豚/);
  });

  it("returns original when compression would be too short", () => {
    expect(extractKbSearchQuery("hi")).toBe("hi");
  });

  it("trims empty to empty", () => {
    expect(extractKbSearchQuery("   ")).toBe("");
  });
});
