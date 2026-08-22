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
    ).toBe(false);
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
    expect(out).toMatch(/红烧肉的做法/);
    expect(out).toMatch(/recipe\.md/);
  });

  it("returns empty for no citations", () => {
    expect(formatKbAnswerFromCitations([], "q")).toBe("");
  });
});
