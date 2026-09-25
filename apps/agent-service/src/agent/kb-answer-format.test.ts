import { describe, expect, it } from "vitest";

import {
  formatKbAnswerFromCitations,
  hasSubstantiveKbAnswer,
  isKbSearchToolOutput,
} from "./kb-answer-format";

describe("isKbSearchToolOutput", () => {
  it("matches kb_search tool protocol text", () => {
    expect(isKbSearchToolOutput("KB_SEARCH_STATUS: HIT\n[citation 1]")).toBe(true);
    expect(
      isKbSearchToolOutput("知识库未找到足够相关依据。\nKB_SEARCH_STATUS: NO_RELEVANT_HIT"),
    ).toBe(true);
    expect(
      isKbSearchToolOutput("【知识库预检索·工具结果·可信】\nKB_SEARCH_STATUS: NO_RELEVANT_HIT"),
    ).toBe(true);
  });
});

describe("hasSubstantiveKbAnswer", () => {
  it("returns false for miss-only text", () => {
    expect(hasSubstantiveKbAnswer("知识库未找到足够相关依据。")).toBe(false);
  });

  it("returns true when snippet content exists", () => {
    expect(hasSubstantiveKbAnswer("根据文档，五花肉需先焯水再炒糖色，慢火炖四十分钟至软烂。")).toBe(
      true,
    );
  });
});

describe("formatKbAnswerFromCitations", () => {
  it("formats top snippet and sources", () => {
    const out = formatKbAnswerFromCitations(
      [
        {
          documentId: "doc-braise",
          title: "红烧肉的做法",
          source: "recipe.md",
          similarity: 0.92,
          snippet: "五花肉切块焯水，加冰糖炒糖色，慢火炖40分钟。",
          chunkIndex: 0,
        },
      ],
      "怎么做红烧肉？",
    );
    expect(out).toMatch(/根据知识库检索结果/);
    expect(out).toMatch(/五花肉切块焯水/);
    expect(out).toMatch(/\[S1\] 红烧肉的做法/);
    expect(out).toMatch(/recipe\.md/);
  });

  it("keeps [S n] tied to the original array index after similarity sort", () => {
    const out = formatKbAnswerFromCitations(
      [
        {
          documentId: "doc-low",
          title: "先入库",
          source: "a.md",
          similarity: 0.7,
          snippet: "较低相似度的片段。",
          chunkIndex: 0,
        },
        {
          documentId: "doc-high",
          title: "后入库",
          source: "b.md",
          similarity: 0.95,
          snippet: "较高相似度的片段，排序后仍是第二条。",
          chunkIndex: 1,
        },
      ],
      "q",
    );
    expect(out).toMatch(/\[S2\] 后入库/);
    expect(out).toMatch(/\[S1\] 先入库/);
  });

  it("returns empty for no citations", () => {
    expect(formatKbAnswerFromCitations([], "q")).toBe("");
  });
});
