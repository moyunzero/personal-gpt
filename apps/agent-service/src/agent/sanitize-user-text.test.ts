/**
 * sanitizeUserFacingAgentText 单测。
 */
import { describe, expect, it } from "vitest";

import {
  containsKbTechMarkers,
  isToolCallLeakText,
  sanitizeUserFacingAgentText,
} from "./sanitize-user-text";

describe("sanitizeUserFacingAgentText", () => {
  it("rewrites parenthetical KB_SEARCH_STATUS NO_RELEVANT_HIT", () => {
    const raw =
      "由于知识库未返回任何相关文档（KB_SEARCH_STATUS 为 NO_RELEVANT_HIT），以上信息全部来源于网络检索。";
    const out = sanitizeUserFacingAgentText(raw);
    expect(out).toMatch(/知识库未找到足够依据/);
    expect(containsKbTechMarkers(out)).toBe(false);
  });

  it("strips HIT / bare markers", () => {
    expect(sanitizeUserFacingAgentText("状态 KB_SEARCH_STATUS: HIT 完成")).not.toMatch(
      /KB_SEARCH_STATUS/i,
    );
    expect(sanitizeUserFacingAgentText("code NO_RELEVANT_HIT here")).toMatch(/未找到足够依据/);
  });

  it("preserves whitespace inside fenced code blocks", () => {
    const raw = ["前言  双空格", "```", "  indented", "\t\ttabbed", "```", "结尾"].join("\n");
    const out = sanitizeUserFacingAgentText(raw);
    expect(out).toContain("  indented");
    expect(out).toContain("\t\ttabbed");
    expect(out).toMatch(/前言 双空格/);
  });

  it("preserves line-leading indent outside fences", () => {
    const raw = "列表:\n  - item  一\n    - nested  二";
    const out = sanitizeUserFacingAgentText(raw);
    expect(out).toContain("  - item 一");
    expect(out).toContain("    - nested 二");
  });

  it("protects unclosed fence from whitespace normalization", () => {
    const raw = "前  言\n```ts\n  keep  spaces";
    const out = sanitizeUserFacingAgentText(raw);
    expect(out).toMatch(/前 言/);
    expect(out).toContain("```ts\n  keep  spaces");
  });

  it("breaks glued markdown heading after KB miss rewrite", () => {
    const raw = "知识库未找到足够相关依据。 KB_SEARCH_STATUS: NO_RELEVANT_HIT# 韶音手册：情报简报";
    const out = sanitizeUserFacingAgentText(raw);
    expect(containsKbTechMarkers(out)).toBe(false);
    expect(out).toMatch(/知识库未找到足够依据\n\n# 韶音手册/);
    expect(out).not.toMatch(/依据#/);
  });

  it("strips leaked graph_search tool JSON", () => {
    const raw = '```json\n{"name": "graph_search", "arguments": {"question": "珍珠奶茶"}}\n```';
    expect(sanitizeUserFacingAgentText(raw)).toBe("");
    expect(isToolCallLeakText(raw)).toBe(true);
  });

  it("strips bare kb_search tool JSON leak", () => {
    const raw = '{"name": "kb_search", "arguments": {"query": "test"}}';
    expect(sanitizeUserFacingAgentText(raw)).toBe("");
    expect(isToolCallLeakText(raw)).toBe(true);
  });

  it("strips Cypher and internal id relationship leaks from graph answers", () => {
    const raw = [
      "根据企业内部知识图谱：",
      "- **珍珠奶茶**",
      "**关系链：**",
      "- [:CONTAINS]->(i:Ingredient) → :USES → (m:Method)",
      "- product:pearl-milk-tea → CONTAINS → ingredient:tapioca",
      "cypher: MATCH path = (p:Product)-[:CONTAINS]->(i:Ingredient)",
    ].join("\n");
    const out = sanitizeUserFacingAgentText(raw);
    expect(out).not.toMatch(/\[:CONTAINS\]/);
    expect(out).not.toMatch(/product:pearl-milk-tea/);
    expect(out).not.toMatch(/cypher/i);
    expect(out).toMatch(/珍珠奶茶/);
  });
});
