/**
 * sanitizeUserFacingAgentText 单测。
 */
import { describe, expect, it } from "vitest";

import { containsKbTechMarkers, sanitizeUserFacingAgentText } from "./sanitize-user-text";

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
});
